import { useEffect } from 'react';

/**
 * Marketing surfaces are dark-only — force-remove the user's `light` theme
 * class while the page is mounted (and restore it on unmount) so the global
 * light-mode token remaps never bleed into the black/gold marketing look.
 *
 * Shared by FullPageLanding and every dual-routed marketing page (blog,
 * use cases, ForTeams): those routes also render inside the authenticated
 * App shell, where a light-theme user would otherwise get a jarring cream
 * page between black marketing screens.
 */
export function useForceDarkTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const wasLight = root.classList.contains('light');
    if (wasLight) root.classList.remove('light');
    return () => {
      if (wasLight) root.classList.add('light');
    };
  }, []);
}
