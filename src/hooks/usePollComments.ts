import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useToast } from '@/hooks/use-toast';
import { tripKeys } from '@/lib/queryKeys';
import { getStorageItem, setStorageItem } from '@/platform/storage';

export interface PollCommentAuthor {
  displayName: string;
  avatarUrl: string | null;
}

export interface PollComment {
  id: string;
  tripId: string;
  pollId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: PollCommentAuthor;
}

interface StoredDemoComment {
  id: string;
  tripId: string;
  pollId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

const DEMO_USER_ID = 'demo-user';

const demoStorageKey = (tripId: string): string => `poll_comments_${tripId}`;

const MAX_COMMENT_LENGTH = 1000;

function resolveDisplayName(
  user: { displayName?: string | null; email?: string | null } | null | undefined,
): string {
  if (!user) return 'Someone';
  return user.displayName || user.email?.split('@')[0] || 'Someone';
}

function mapStoredDemoComment(row: StoredDemoComment): PollComment {
  return {
    id: row.id,
    tripId: row.tripId,
    pollId: row.pollId,
    userId: row.userId,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    },
  };
}

async function readDemoComments(tripId: string): Promise<StoredDemoComment[]> {
  return getStorageItem<StoredDemoComment[]>(demoStorageKey(tripId), []);
}

async function writeDemoComments(tripId: string, comments: StoredDemoComment[]): Promise<void> {
  await setStorageItem(demoStorageKey(tripId), comments);
}

export function useTripPollCommentCounts(tripId: string) {
  const { isDemoMode } = useDemoMode();

  return useQuery({
    queryKey: tripKeys.pollCommentCounts(tripId, isDemoMode),
    enabled: !!tripId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, number>> => {
      if (isDemoMode) {
        const stored = await readDemoComments(tripId);
        return stored.reduce<Record<string, number>>((acc, comment) => {
          acc[comment.pollId] = (acc[comment.pollId] ?? 0) + 1;
          return acc;
        }, {});
      }

      const { data, error } = await supabase
        .from('poll_comments')
        .select('poll_id')
        .eq('trip_id', tripId);

      if (error) throw error;

      return (data ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.poll_id] = (acc[row.poll_id] ?? 0) + 1;
        return acc;
      }, {});
    },
  });
}

export function usePollComments(tripId: string, pollId: string, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const queryKey = tripKeys.pollComments(tripId, pollId, isDemoMode);

  const commentsQuery = useQuery({
    queryKey,
    enabled: !!tripId && !!pollId && enabled,
    staleTime: 20 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PollComment[]> => {
      if (isDemoMode) {
        const stored = await readDemoComments(tripId);
        return stored
          .filter(comment => comment.pollId === pollId)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map(mapStoredDemoComment);
      }

      const { data, error } = await supabase
        .from('poll_comments')
        .select('id, trip_id, poll_id, user_id, body, created_at, updated_at')
        .eq('trip_id', tripId)
        .eq('poll_id', pollId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = data ?? [];
      const userIds = [...new Set(rows.map(row => row.user_id))];

      const profileByUserId = new Map<string, PollCommentAuthor>();
      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds);

        if (profileError) {
          if (import.meta.env.DEV) {
            console.error('Failed to load poll comment profiles:', profileError);
          }
        } else {
          (profiles ?? []).forEach(profile => {
            profileByUserId.set(profile.user_id, {
              displayName: profile.display_name || 'Traveler',
              avatarUrl: profile.avatar_url,
            });
          });
        }
      }

      return rows.map(row => ({
        id: row.id,
        tripId: row.trip_id,
        pollId: row.poll_id,
        userId: row.user_id,
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        author: profileByUserId.get(row.user_id) ?? {
          displayName: 'Traveler',
          avatarUrl: null,
        },
      }));
    },
  });

  const invalidateCounts = () => {
    void queryClient.invalidateQueries({
      queryKey: tripKeys.pollCommentCounts(tripId, isDemoMode),
    });
  };

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) {
        throw new Error('Comment cannot be empty.');
      }
      if (trimmed.length > MAX_COMMENT_LENGTH) {
        throw new Error(`Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
      }

      if (isDemoMode) {
        const now = new Date().toISOString();
        const comment: StoredDemoComment = {
          id: `demo-comment-${Date.now()}`,
          tripId,
          pollId,
          userId: DEMO_USER_ID,
          body: trimmed,
          createdAt: now,
          updatedAt: now,
          displayName: resolveDisplayName(user) === 'Someone' ? 'You' : resolveDisplayName(user),
          avatarUrl: null,
        };
        const existing = await readDemoComments(tripId);
        await writeDemoComments(tripId, [...existing, comment]);
        return mapStoredDemoComment(comment);
      }

      if (!user?.id) {
        throw new Error('Please sign in to leave a comment.');
      }

      const { data, error } = await supabase
        .from('poll_comments')
        .insert({
          trip_id: tripId,
          poll_id: pollId,
          user_id: user.id,
          body: trimmed,
        })
        .select('id, trip_id, poll_id, user_id, body, created_at, updated_at')
        .single();

      if (error) throw error;

      return {
        id: data.id,
        tripId: data.trip_id,
        pollId: data.poll_id,
        userId: data.user_id,
        body: data.body,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        author: {
          displayName: resolveDisplayName(user),
          avatarUrl: user.avatar ?? null,
        },
      } satisfies PollComment;
    },
    onMutate: async body => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PollComment[]>(queryKey);
      const optimistic: PollComment = {
        id: `optimistic-comment-${Date.now()}`,
        tripId,
        pollId,
        userId: user?.id ?? DEMO_USER_ID,
        body: body.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          displayName: resolveDisplayName(user) === 'Someone' ? 'You' : resolveDisplayName(user),
          avatarUrl: user?.avatar ?? null,
        },
      };
      queryClient.setQueryData<PollComment[]>(queryKey, old => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({
        title: 'Could not post comment',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      invalidateCounts();
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (isDemoMode) {
        const existing = await readDemoComments(tripId);
        await writeDemoComments(
          tripId,
          existing.filter(comment => comment.id !== commentId),
        );
        return commentId;
      }

      const { error } = await supabase.from('poll_comments').delete().eq('id', commentId);
      if (error) throw error;
      return commentId;
    },
    onMutate: async commentId => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PollComment[]>(queryKey);
      queryClient.setQueryData<PollComment[]>(queryKey, old =>
        (old ?? []).filter(comment => comment.id !== commentId),
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast({
        title: 'Could not delete comment',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      invalidateCounts();
    },
  });

  useEffect(() => {
    if (!enabled || !tripId || !pollId || isDemoMode) return;
    if (typeof supabase.channel !== 'function') return;

    const channel = supabase
      .channel(`poll_comments:${pollId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'poll_comments',
          filter: `poll_id=eq.${pollId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey });
          invalidateCounts();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, tripId, pollId, isDemoMode, queryClient, queryKey]);

  return {
    comments: commentsQuery.data ?? [],
    isLoading: commentsQuery.isLoading,
    addComment: addCommentMutation.mutateAsync,
    deleteComment: deleteCommentMutation.mutateAsync,
    isAdding: addCommentMutation.isPending,
    isDeleting: deleteCommentMutation.isPending,
    currentUserId: user?.id ?? (isDemoMode ? DEMO_USER_ID : undefined),
  };
}
