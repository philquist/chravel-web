import { useBlockedUserProfiles } from '@/hooks/useUserSafety';

/**
 * In-app management of users the current user has blocked (view + unblock).
 * Required by App Store Guideline 1.2 — the chat block action tells users they can
 * "unblock them later from Settings", so that surface must actually exist.
 */
export const BlockedUsersList = () => {
  const { blockedUsers, isLoading, unblockUser, isUnblocking, unblockingId } =
    useBlockedUserProfiles();

  if (isLoading) {
    return <div className="text-sm text-gray-400">Loading blocked users…</div>;
  }

  if (blockedUsers.length === 0) {
    return <div className="text-sm text-gray-400">You haven't blocked anyone.</div>;
  }

  return (
    <ul className="space-y-2">
      {blockedUsers.map(blocked => {
        const pending = isUnblocking && unblockingId === blocked.id;
        return (
          <li key={blocked.id} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {blocked.avatarUrl ? (
                <img src={blocked.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs text-white/70">
                  {blocked.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-sm text-white">{blocked.displayName}</span>
            </div>
            <button
              type="button"
              onClick={() => unblockUser(blocked.id)}
              disabled={pending}
              className="shrink-0 text-xs text-primary transition-colors hover:text-gold-light disabled:opacity-50"
            >
              {pending ? 'Unblocking…' : 'Unblock'}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
