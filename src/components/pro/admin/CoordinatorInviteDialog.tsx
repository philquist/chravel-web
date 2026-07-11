import React, { useMemo, useState } from 'react';
import { ShieldCheck, UserPlus, Loader2, X, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { ScrollArea } from '../../ui/scroll-area';
import { Badge } from '../../ui/badge';
import { getInitials } from '../../../utils/avatarUtils';
import { useTripAdmins } from '../../../hooks/useTripAdmins';
import { ProParticipant } from '../../../types/pro';

interface CoordinatorInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  roster: ProParticipant[];
}

/**
 * Team-tab dialog for promoting an existing trip member to Coordinator scope.
 * Coordinators get logistics-only access (calendar, tasks, places, links) —
 * they cannot see private chat, AI Concierge conversations, or private media.
 * RLS enforces the boundary server-side via `is_full_trip_admin`.
 */
export const CoordinatorInviteDialog: React.FC<CoordinatorInviteDialogProps> = ({
  open,
  onOpenChange,
  tripId,
  roster,
}) => {
  const { admins, promoteToAdmin, setAdminScope, demoteFromAdmin, isProcessing } = useTripAdmins({
    tripId,
    enabled: open,
  });
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const adminByUserId = useMemo(() => {
    const m = new Map<string, (typeof admins)[number]>();
    admins.forEach(a => m.set(a.user_id, a));
    return m;
  }, [admins]);

  const rosterByUserId = useMemo(() => {
    const m = new Map<string, ProParticipant>();
    roster.forEach(r => {
      const uid = r.userId || r.id;
      if (uid) m.set(uid, r);
    });
    return m;
  }, [roster]);

  const coordinators = useMemo(() => admins.filter(a => a.admin_scope === 'coordinator'), [admins]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter(m => {
      const uid = m.userId || m.id;
      if (!uid || adminByUserId.has(uid)) return false;
      if (!q) return true;
      return (
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
      );
    });
  }, [roster, adminByUserId, query]);

  const handlePromote = async (userId: string) => {
    setBusyId(userId);
    try {
      await promoteToAdmin(userId, { scope: 'coordinator' });
    } finally {
      setBusyId(null);
    }
  };

  const handleUpgradeToFull = async (userId: string) => {
    setBusyId(userId);
    try {
      await setAdminScope(userId, 'full');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (userId: string) => {
    setBusyId(userId);
    try {
      await demoteFromAdmin(userId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-950 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            Coordinator access
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Give an outside organizer logistics-only access. Coordinators can manage the calendar,
            tasks, places, and links — they{' '}
            <span className="text-amber-300">
              cannot see private chat, AI Concierge, or private media.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2 text-xs text-amber-100">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            The privacy boundary is enforced at the database level. Only full admins can access
            private surfaces.
          </span>
        </div>

        {/* Can / Can't panel — mirrors the concierge blog article */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] p-2.5">
            <div className="text-[11px] font-medium text-emerald-300 mb-1">Can manage</div>
            <ul className="text-[11px] text-gray-300 space-y-0.5 leading-snug">
              <li>· Calendar</li>
              <li>· Tasks</li>
              <li>· Places & links</li>
              <li>· Files & broadcasts</li>
            </ul>
          </div>
          <div className="rounded-lg border border-red-400/20 bg-red-500/[0.04] p-2.5">
            <div className="text-[11px] font-medium text-red-300 mb-1">Cannot see</div>
            <ul className="text-[11px] text-gray-300 space-y-0.5 leading-snug">
              <li>· Private chat</li>
              <li>· AI Concierge</li>
              <li>· Private media</li>
              <li>· Private channels</li>
            </ul>
          </div>
        </div>

        {coordinators.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              Current coordinators
            </div>
            <div className="space-y-1.5">
              {coordinators.map(c => {
                const rosterEntry = rosterByUserId.get(c.user_id);
                const displayName =
                  c.profile?.display_name || rosterEntry?.name || `${c.user_id.slice(0, 8)}…`;
                const avatar = c.profile?.avatar_url || rosterEntry?.avatar;
                return (
                  <div
                    key={c.user_id}
                    className="flex items-center gap-2 rounded-md bg-white/5 border border-white/10 p-2"
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={avatar} alt={displayName} />
                      <AvatarFallback className="text-xs">
                        {getInitials(displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white truncate">{displayName}</div>
                      <Badge
                        variant="outline"
                        className="mt-0.5 text-[10px] border-amber-400/40 text-amber-300"
                      >
                        Coordinator
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isProcessing && busyId === c.user_id}
                      onClick={() => handleUpgradeToFull(c.user_id)}
                      className="text-xs h-8 text-white hover:text-amber-300"
                    >
                      Make full admin
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isProcessing && busyId === c.user_id}
                      onClick={() => handleRevoke(c.user_id)}
                      className="text-xs h-8 text-red-300 hover:text-red-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-gray-400">Add from roster</div>
          <Input
            placeholder="Search members…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="bg-black/40 border-white/10 text-white"
          />
          <ScrollArea className="h-64 rounded-md border border-white/10">
            {candidates.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                No eligible members found.
              </div>
            ) : (
              <div className="p-1">
                {candidates.map(m => {
                  const uid = m.userId || m.id;
                  return (
                    <div
                      key={uid}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={m.avatar} alt={m.name} />
                        <AvatarFallback className="text-xs">
                          {getInitials(m.name || '')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white truncate">{m.name}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {m.role || m.email || ''}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!uid || (isProcessing && busyId === uid)}
                        onClick={() => uid && handlePromote(uid)}
                        className="h-8 text-xs border-amber-400/40 text-amber-200 hover:bg-amber-400/10"
                      >
                        {isProcessing && busyId === uid ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5 mr-1" />
                            Coordinator
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
