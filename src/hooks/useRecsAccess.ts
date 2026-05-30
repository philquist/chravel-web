import { useSuperAdmin } from './useSuperAdmin';
import { useDemoMode } from './useDemoMode';

/**
 * Single source of truth for Chravel Recs visibility/access.
 *
 * Recs is an internal/admin preview (mock data) during MVP. It is accessible to
 * authenticated super admins OR the existing app-preview investor demo, and hidden
 * from everyone else. Consume this in both navigation surfaces and the route guard
 * so visibility and access never drift apart.
 */
export const useRecsAccess = () => {
  const { isSuperAdmin } = useSuperAdmin();
  const { demoView } = useDemoMode();
  const isAppPreview = demoView === 'app-preview';

  return {
    canAccessRecs: isSuperAdmin || isAppPreview,
    isSuperAdmin,
    isAppPreview,
  };
};
