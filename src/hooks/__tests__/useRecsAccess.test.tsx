import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useSuperAdmin', () => ({ useSuperAdmin: vi.fn() }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: vi.fn() }));

import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useRecsAccess } from '@/hooks/useRecsAccess';

describe('useRecsAccess', () => {
  it('grants access to authenticated super admins', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: true });
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'off' } as never);

    const { result } = renderHook(() => useRecsAccess());
    expect(result.current.canAccessRecs).toBe(true);
    expect(result.current.isSuperAdmin).toBe(true);
  });

  it('grants access in app-preview demo mode (no super admin)', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'app-preview' } as never);

    const { result } = renderHook(() => useRecsAccess());
    expect(result.current.canAccessRecs).toBe(true);
    expect(result.current.isAppPreview).toBe(true);
  });

  it('denies normal users (no super admin, not app-preview)', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'off' } as never);

    const { result } = renderHook(() => useRecsAccess());
    expect(result.current.canAccessRecs).toBe(false);
  });

  it('treats marketing demo view as no access', () => {
    vi.mocked(useSuperAdmin).mockReturnValue({ isSuperAdmin: false });
    vi.mocked(useDemoMode).mockReturnValue({ demoView: 'marketing' } as never);

    const { result } = renderHook(() => useRecsAccess());
    expect(result.current.canAccessRecs).toBe(false);
  });
});
