import { beforeEach, describe, expect, it, vi } from 'vitest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

const mockCustomerInfo = {
  originalAppUserId: 'user-1',
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
  entitlements: { active: {}, all: {} },
  firstSeen: '2026-07-15T00:00:00Z',
  latestExpirationDate: null,
  managementURL: null,
  nonSubscriptionTransactions: [],
  originalPurchaseDate: null,
  requestDate: '2026-07-15T00:00:00Z',
};

describe('revenuecatClient initialization race hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as unknown as { Purchases?: unknown }).Purchases;
  });

  async function loadClient(plugin: Record<string, unknown>) {
    vi.doMock('@/constants/revenuecat', () => ({
      REVENUECAT_ENABLED: true,
      getRevenueCatApiKey: vi.fn(() => 'rc_ios_key'),
      isRevenueCatConfigured: vi.fn(() => true),
      ENTITLEMENT_TO_TIER: {},
      REVENUECAT_ENTITLEMENTS: {
        explorer: 'explorer',
        frequentChraveler: 'frequent_chraveler',
      },
      REVENUECAT_PRODUCTS: {
        explorerPass45: 'explorer.pass45',
        frequentChravelerPass90: 'frequent.pass90',
        explorerMonthly: 'explorer.monthly',
        explorerAnnual: 'explorer.annual',
        frequentChravelerMonthly: 'frequent.monthly',
        frequentChravelerAnnual: 'frequent.annual',
        proStarterMonthly: 'pro.starter.monthly',
        proGrowthMonthly: 'pro.growth.monthly',
      },
      REQUIRED_IOS_PRODUCT_IDS: [],
      assertIosProductIdsConfigured: vi.fn(() => ({ ok: true, blank: [] })),
    }));

    vi.doMock('@/utils/platformDetection', () => ({
      detectNativeBillingPlatform: vi.fn(() => 'ios'),
      isNativeWebView: vi.fn(() => true),
    }));

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        functions: { invoke: vi.fn() },
        auth: { getSession: vi.fn() },
      },
    }));

    (window as unknown as { Purchases: Record<string, unknown> }).Purchases = plugin;
    return import('../revenuecatClient');
  }

  it('does not let immediate identify run before configure resolves', async () => {
    const configured = deferred<void>();
    const events: string[] = [];
    const plugin = {
      configure: vi.fn(async () => {
        events.push('configure:start');
        await configured.promise;
        events.push('configure:done');
      }),
      logIn: vi.fn(async () => {
        events.push('login');
      }),
      getOfferings: vi.fn(async () => ({ current: null, all: {} })),
    };
    const { configureRevenueCat, identifyUser } = await loadClient(plugin);

    const configurePromise = configureRevenueCat('user-1');
    await Promise.resolve();

    const identifyPromise = identifyUser('user-1');
    await Promise.resolve();

    expect(plugin.logIn).not.toHaveBeenCalled();

    configured.resolve();
    await Promise.all([configurePromise, identifyPromise]);

    expect(plugin.configure).toHaveBeenCalledTimes(1);
    expect(plugin.logIn).toHaveBeenCalledWith({ appUserID: 'user-1' });
    expect(events).toEqual(['configure:start', 'configure:done', 'login']);
  });

  it('makes getCustomerInfo wait for the shared configure promise', async () => {
    const configured = deferred<void>();
    const events: string[] = [];
    const plugin = {
      configure: vi.fn(async () => {
        events.push('configure:start');
        await configured.promise;
        events.push('configure:done');
      }),
      getCustomerInfo: vi.fn(async () => {
        events.push('customerInfo');
        return { customerInfo: mockCustomerInfo };
      }),
      getOfferings: vi.fn(async () => ({ current: null, all: {} })),
    };
    const { configureRevenueCat, getCustomerInfo } = await loadClient(plugin);

    const configurePromise = configureRevenueCat('user-1');
    await Promise.resolve();

    const customerInfoPromise = getCustomerInfo();
    await Promise.resolve();

    expect(plugin.getCustomerInfo).not.toHaveBeenCalled();

    configured.resolve();
    const [customerInfoResult] = await Promise.all([customerInfoPromise, configurePromise]);

    expect(customerInfoResult.success).toBe(true);
    expect(plugin.configure).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['configure:start', 'configure:done', 'customerInfo']);
  });
});
