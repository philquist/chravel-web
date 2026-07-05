import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { invalidateTripCoverQueries, updateTripCoverCache } from '@/lib/tripCoverInvalidation';

export const AI_COVER_MONTHLY_CAP = 10;

interface GenerateResult {
  ok: true;
  publicUrl: string;
  remaining: number;
}
interface GenerateFail {
  ok: false;
  error: string;
  code?: string;
}
export type GenerateCoverResult = GenerateResult | GenerateFail;

/**
 * Generate an AI trip cover photo via the `generate-trip-cover` edge function.
 * The edge function is the sole enforcer of entitlement (Frequent Chraveler)
 * and monthly cap; this hook only surfaces state and refreshes caches.
 */
export function useGenerateCoverPhoto(tripId: string | undefined | null) {
  const { user } = useAuth();
  const { isFrequentChraveler } = useSubscription();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);
  const [remainingThisMonth, setRemainingThisMonth] = useState<number | null>(null);

  // Fetch current usage so the UI can show "N of 10 left". RLS restricts to own rows.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRemainingThisMonth(null);
      return;
    }
    const periodMonth = new Date().toISOString().slice(0, 7) + '-01';
    (async () => {
      const { count, error } = await supabase
        .from('ai_cover_generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('period_month', periodMonth);
      if (cancelled) return;
      if (error) {
        setRemainingThisMonth(null);
        return;
      }
      setRemainingThisMonth(Math.max(0, AI_COVER_MONTHLY_CAP - (count ?? 0)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isGenerating]);

  const generate = useCallback(async (): Promise<GenerateCoverResult> => {
    if (!tripId) return { ok: false, error: 'Missing trip' };
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-trip-cover', {
        body: { tripId },
      });
      if (error) {
        const message = (error as { message?: string })?.message || 'Cover generation failed';
        return { ok: false, error: message };
      }
      if (!data?.publicUrl) {
        return {
          ok: false,
          error: data?.error || 'Cover generation returned no image',
          code: data?.code,
        };
      }
      updateTripCoverCache(queryClient, tripId, data.publicUrl);
      await invalidateTripCoverQueries(queryClient, tripId);
      if (typeof data.remaining === 'number') setRemainingThisMonth(data.remaining);
      return { ok: true, publicUrl: data.publicUrl, remaining: data.remaining ?? 0 };
    } finally {
      setIsGenerating(false);
    }
  }, [tripId, queryClient]);

  return {
    generate,
    isGenerating,
    remainingThisMonth,
    cap: AI_COVER_MONTHLY_CAP,
    isEligible: isFrequentChraveler,
  } as const;
}
