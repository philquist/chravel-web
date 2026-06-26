const PENDING_INVITE_KEY = 'chravel_pending_invite_code';

function readStorage(storage: Storage | undefined): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(PENDING_INVITE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, value: string | null): void {
  if (!storage) return;
  try {
    if (value && value.trim().length > 0) {
      storage.setItem(PENDING_INVITE_KEY, value);
    } else {
      storage.removeItem(PENDING_INVITE_KEY);
    }
  } catch {
    // Ignore unavailable storage environments.
  }
}

function getSessionStorage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.sessionStorage : undefined;
}

function getLocalStorage(): Storage | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function mirrorPendingInviteCode(code: string | null): void {
  writeStorage(getSessionStorage(), code);
  writeStorage(getLocalStorage(), code);
}

export function getPendingInviteCode(): string | null {
  const sessionValue = readStorage(getSessionStorage());
  if (sessionValue) {
    writeStorage(getLocalStorage(), sessionValue);
    return sessionValue;
  }

  const localValue = readStorage(getLocalStorage());
  if (localValue) {
    writeStorage(getSessionStorage(), localValue);
    return localValue;
  }

  return null;
}

export function storePendingInviteCode(code: string): void {
  mirrorPendingInviteCode(code.trim());
}

export function clearPendingInviteCode(): void {
  mirrorPendingInviteCode(null);
}

export { PENDING_INVITE_KEY };
