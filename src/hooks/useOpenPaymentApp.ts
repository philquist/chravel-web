import { useCallback } from 'react';
import type { PaymentDeeplinkTarget } from '@/utils/paymentDeeplinks';

type CapacitorAppPlugin = {
  openUrl: (options: { url: string }) => Promise<void>;
};

type CapacitorBrowserPlugin = {
  open: (options: { url: string; presentationStyle?: 'popover' | 'fullscreen' }) => Promise<void>;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    Plugins?: {
      App?: CapacitorAppPlugin;
      Browser?: CapacitorBrowserPlugin;
    };
  };
};

const PAYMENT_APP_FALLBACK_MS = 800;

const getCapacitorPlugins = () => {
  if (typeof window === 'undefined') return { app: null, browser: null };
  const plugins = (window as CapacitorWindow).Capacitor?.Plugins;
  return {
    app: plugins?.App && typeof plugins.App.openUrl === 'function' ? plugins.App : null,
    browser:
      plugins?.Browser && typeof plugins.Browser.open === 'function' ? plugins.Browser : null,
  };
};

const openWebUrl = async (url: string): Promise<void> => {
  const { browser } = getCapacitorPlugins();
  if (browser) {
    await browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

const openAppUrlWithFallback = async (appUrl: string, webUrl: string | null): Promise<void> => {
  const { app } = getCapacitorPlugins();

  if (app) {
    await app.openUrl({ url: appUrl });
  } else {
    window.location.href = appUrl;
  }

  if (!webUrl) return;

  window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      void openWebUrl(webUrl);
    }
  }, PAYMENT_APP_FALLBACK_MS);
};

export const useOpenPaymentApp = () => {
  return useCallback(async (target: PaymentDeeplinkTarget): Promise<void> => {
    if (target.appUrl) {
      await openAppUrlWithFallback(target.appUrl, target.webUrl);
      return;
    }

    if (target.webUrl) {
      await openWebUrl(target.webUrl);
    }
  }, []);
};
