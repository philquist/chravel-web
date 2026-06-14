export interface SettingsRouteIntent {
  shouldOpen: boolean;
  consumerSection?: string;
}

// Consumer settings sections that may be opened via the `?openSettings=` deep
// link. Kept as an explicit allowlist so an arbitrary/unknown section id can't
// be forced open. `settings` is the General Settings section, which hosts the
// in-app account-deletion flow (Account Management → Delete Account).
const DEEP_LINK_SECTIONS = new Set(['saved-recs', 'settings']);

export function getSettingsRouteIntent(search: string): SettingsRouteIntent {
  const openSetting = new URLSearchParams(search).get('openSettings');

  if (openSetting && DEEP_LINK_SECTIONS.has(openSetting)) {
    return { shouldOpen: true, consumerSection: openSetting };
  }

  return { shouldOpen: false };
}
