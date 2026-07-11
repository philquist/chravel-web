import React, { useEffect, useMemo, useState } from 'react';
import { Building2, ShieldCheck, UserPlus, X, Loader2, Plus, Check, Users } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTripAdmins } from '@/hooks/useTripAdmins';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getInitials } from '@/utils/avatarUtils';
import { CreateOrganizationModal } from '@/components/enterprise/CreateOrganizationModal';

interface TravelCompanySectionProps {
  tripId: string;
}

interface OrgMemberRow {
  user_id: string;
  role: string;
  profile?: { display_name: string | null; avatar_url: string | null; email?: string | null };
}

/**
 * Trip-scoped "Travel Company" settings for Pro trips.
 * - Attach the trip to an organization the current user belongs to (pro_trip_organizations).
 * - Grant Coordinator scope to org teammates so they can run logistics for the client
 *   without seeing private family chat, AI Concierge, or private media.
 * - Optional: creator can voluntarily downgrade themselves to Coordinator.
 */
export const TravelCompanySection: React.FC<TravelCompanySectionProps> = ({ tripId }) => {
  const { user } = useAuth();
  const { organizations, loading: orgsLoading } = useOrganization();
  const { admins, promoteToAdmin, setAdminScope, demoteFromAdmin, isProcessing } = useTripAdmins({
    tripId,
    enabled: !!tripId,
  });

  const [linkedOrgId, setLinkedOrgId] = useState<string | null>(null);
  const [linkedLoaded, setLinkedLoaded] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [selectValue, setSelectValue] = useState<string>('');
  const [orgMembers, setOrgMembers] = useState<OrgMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Load current trip↔org link
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('pro_trip_organizations')
        .select('organization_id')
        .eq('trip_id', tripId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        setLinkedOrgId(data.organization_id);
        setSelectValue(data.organization_id);
      }
      setLinkedLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // Load members of the linked org
  useEffect(() => {
    let cancelled = false;
    if (!linkedOrgId) {
      setOrgMembers([]);
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    (async () => {
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, role')
        .eq('organization_id', linkedOrgId)
        .eq('status', 'active');
      if (cancelled) return;
      if (!members?.length) {
        setOrgMembers([]);
        setMembersLoading(false);
        return;
      }
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('user_id, display_name, resolved_display_name, avatar_url')
        .in('user_id', userIds);
      const map = new Map<string, OrgMemberRow['profile']>();
      profiles?.forEach(p =>
        map.set(p.user_id, {
          display_name: p.resolved_display_name || p.display_name,
          avatar_url: p.avatar_url,
        }),
      );
      if (!cancelled) {
        setOrgMembers(
          members.map(m => ({ user_id: m.user_id, role: m.role, profile: map.get(m.user_id) })),
        );
        setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkedOrgId]);

  const adminByUserId = useMemo(() => {
    const m = new Map<string, (typeof admins)[number]>();
    admins.forEach(a => m.set(a.user_id, a));
    return m;
  }, [admins]);

  const coordinatorCount = useMemo(
    () => admins.filter(a => a.admin_scope === 'coordinator').length,
    [admins],
  );

  const isCurrentUserOrgMember = useMemo(
    () => !!user && orgMembers.some(m => m.user_id === user.id),
    [orgMembers, user],
  );
  const currentUserAdmin = user ? adminByUserId.get(user.id) : undefined;

  const handleLinkOrg = async () => {
    if (!selectValue || selectValue === linkedOrgId) return;
    setSavingLink(true);
    try {
      const { error } = await supabase.functions.invoke('link-trip-to-organization', {
        body: { tripId, organizationId: selectValue },
      });
      if (error) throw error;
      setLinkedOrgId(selectValue);
      toast.success('Travel company linked to this trip');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to link organization';
      toast.error(msg);
    } finally {
      setSavingLink(false);
    }
  };

  const handleUnlinkOrg = async () => {
    if (!linkedOrgId) return;
    setSavingLink(true);
    try {
      const { error } = await supabase
        .from('pro_trip_organizations')
        .delete()
        .eq('trip_id', tripId);
      if (error) throw error;
      setLinkedOrgId(null);
      setSelectValue('');
      toast.success('Travel company unlinked');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to unlink';
      toast.error(msg);
    } finally {
      setSavingLink(false);
    }
  };

  const handlePromoteCoordinator = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await promoteToAdmin(userId, { scope: 'coordinator' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRevoke = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await demoteFromAdmin(userId);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSelfDowngradeToCoordinator = async () => {
    if (!user) return;
    setBusyUserId(user.id);
    try {
      if (currentUserAdmin) {
        await setAdminScope(user.id, 'coordinator');
      } else {
        await promoteToAdmin(user.id, { scope: 'coordinator' });
      }
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/30 to-amber-600/20 border border-amber-400/30 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-amber-300" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-semibold text-white">Travel Company</h3>
          <p className="text-sm text-gray-400 mt-1">
            Attach your organization to this trip and grant your team logistics-only access.
          </p>
        </div>
      </div>

      {/* Attach organization */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-semibold text-white">Organization</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Only shown to your team. Guests never see this attribution.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateOrg(true)}
            className="text-xs inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
          >
            <Plus className="w-3.5 h-3.5" /> Create organization
          </button>
        </div>

        {orgsLoading || !linkedLoaded ? (
          <div className="h-11 rounded-lg bg-white/5 animate-pulse" />
        ) : organizations.length === 0 ? (
          <p className="text-sm text-gray-400">
            You're not part of any organizations yet. Create one to run trips under your travel
            brand.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectValue}
              onChange={e => setSelectValue(e.target.value)}
              className="flex-1 bg-gray-800/60 border border-white/10 text-white rounded-lg px-3 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            >
              <option value="">Select an organization…</option>
              {organizations.map(o => (
                <option key={o.id} value={o.id}>
                  {o.display_name || o.name}
                </option>
              ))}
            </select>
            <Button
              onClick={handleLinkOrg}
              disabled={savingLink || !selectValue || selectValue === linkedOrgId}
              className="bg-amber-500 hover:bg-amber-400 text-black font-medium min-h-[44px]"
            >
              {savingLink ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : linkedOrgId ? (
                'Update'
              ) : (
                'Attach'
              )}
            </Button>
            {linkedOrgId && (
              <Button
                variant="outline"
                onClick={handleUnlinkOrg}
                disabled={savingLink}
                className="border-white/15 text-gray-200 hover:text-white min-h-[44px]"
              >
                Unlink
              </Button>
            )}
          </div>
        )}

        {linkedOrgId && (
          <div className="flex items-center gap-2 text-xs text-emerald-300">
            <Check className="w-3.5 h-3.5" />
            Attached to{' '}
            {organizations.find(o => o.id === linkedOrgId)?.display_name || 'organization'}
          </div>
        )}
      </div>

      {/* Coordinators */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <ShieldCheck className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h4 className="text-base font-semibold text-white">Coordinators from your team</h4>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Coordinators run logistics — calendar, tasks, places, files, links.{' '}
                <span className="text-amber-200">
                  They never see private family chat, AI Concierge, or private media.
                </span>{' '}
                Enforced at the database level.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-amber-400/40 text-amber-200 text-[10px] tracking-wide uppercase shrink-0"
          >
            {coordinatorCount} active
          </Badge>
        </div>

        {/* Self-downgrade for concierge owners */}
        {user && isCurrentUserOrgMember && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-white font-medium">Assign yourself as Coordinator</div>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Downgrade your own access on this trip so you can help with logistics without seeing
                private family conversations.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleSelfDowngradeToCoordinator}
              disabled={
                isProcessing ||
                busyUserId === user.id ||
                currentUserAdmin?.admin_scope === 'coordinator'
              }
              className="bg-amber-500 hover:bg-amber-400 text-black font-medium shrink-0"
            >
              {busyUserId === user.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : currentUserAdmin?.admin_scope === 'coordinator' ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1" />
                  You're a Coordinator
                </>
              ) : (
                'Assign me'
              )}
            </Button>
          </div>
        )}

        {!linkedOrgId ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/30 p-5 flex flex-col items-center text-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-gray-400" />
            </div>
            <div className="text-sm text-white font-medium">Attach an organization first</div>
            <p className="text-xs text-gray-400 max-w-xs">
              Once linked, your teammates appear here and can be promoted to Coordinator in one
              click.
            </p>
          </div>
        ) : membersLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-black/25 border border-white/[0.06]"
              >
                <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded bg-white/5 animate-pulse" />
                  <div className="h-2.5 w-20 rounded bg-white/5 animate-pulse" />
                </div>
                <div className="h-7 w-28 rounded bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        ) : orgMembers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/30 p-5 flex flex-col items-center text-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-gray-400" />
            </div>
            <div className="text-sm text-white font-medium">No teammates yet</div>
            <p className="text-xs text-gray-400 max-w-xs">
              Invite teammates to your organization to assign them Coordinator access on client
              trips.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {orgMembers.map(m => {
              const existing = adminByUserId.get(m.user_id);
              const name = m.profile?.display_name || m.user_id.slice(0, 8);
              const busy = busyUserId === m.user_id && isProcessing;
              return (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-black/25 border border-white/[0.06] hover:border-white/10 transition"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} alt={name} />
                    <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{name}</div>
                    <div className="text-xs text-gray-400 truncate capitalize">
                      {m.role} · organization
                    </div>
                  </div>
                  {existing?.admin_scope === 'full' ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-400/40 text-emerald-300 text-[10px]"
                    >
                      Full admin
                    </Badge>
                  ) : existing?.admin_scope === 'coordinator' ? (
                    <>
                      <Badge
                        variant="outline"
                        className="border-amber-400/40 text-amber-300 text-[10px]"
                      >
                        Coordinator
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => handleRevoke(m.user_id)}
                        className="text-xs h-8 text-red-300 hover:text-red-200"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handlePromoteCoordinator(m.user_id)}
                      className="h-8 text-xs border-amber-400/40 text-amber-200 hover:bg-amber-400/10"
                    >
                      {busy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5 mr-1" />
                          Assign as Coordinator
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Boundary explainer — matches the concierge blog article */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
          What Coordinators can & can't do
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
            <div className="text-sm font-medium text-emerald-300 mb-1.5">Can manage</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>· Shared calendar & itinerary</li>
              <li>· Tasks & to-dos</li>
              <li>· Places & base camps</li>
              <li>· Files & links</li>
              <li>· Broadcasts</li>
            </ul>
          </div>
          <div className="rounded-lg border border-red-400/20 bg-red-500/[0.04] p-3">
            <div className="text-sm font-medium text-red-300 mb-1.5">Cannot see</div>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>· Private family chat</li>
              <li>· AI Concierge conversations</li>
              <li>· Private photos & media</li>
              <li>· Private channels they aren't added to</li>
            </ul>
          </div>
        </div>
      </div>

      <CreateOrganizationModal
        open={showCreateOrg}
        onClose={() => setShowCreateOrg(false)}
        onSuccess={() => setShowCreateOrg(false)}
      />
    </div>
  );
};
