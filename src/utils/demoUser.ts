const DEMO_USER_ID_KEY = 'demo-user-id';

/**
 * Stable per-session pseudo-user id used for demo-mode writes.
 * Persisted in sessionStorage so the same browser tab reuses one id across actions.
 */
export function getDemoUserId(): string {
  let demoId = sessionStorage.getItem(DEMO_USER_ID_KEY);
  if (!demoId) {
    demoId = `demo-user-${Date.now()}`;
    sessionStorage.setItem(DEMO_USER_ID_KEY, demoId);
  }
  return demoId;
}

/** Real auth user id when signed in, otherwise the stable demo id. */
export function getEffectiveUserId(userId: string | null | undefined): string {
  return userId || getDemoUserId();
}
