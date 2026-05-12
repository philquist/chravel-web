export interface SettingsRouteIntent {
  shouldOpen: boolean;
  consumerSection?: string;
}

export function getSettingsRouteIntent(search: string): SettingsRouteIntent {
  const openSetting = new URLSearchParams(search).get('openSettings');

  if (openSetting === 'saved-recs') {
    return { shouldOpen: true, consumerSection: 'saved-recs' };
  }

  return { shouldOpen: false };
}
