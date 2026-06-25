import { buildPaymentDeeplink } from './paymentDeeplinks';

describe('buildPaymentDeeplink', () => {
  it('builds Venmo app and web URLs from the saved handle', () => {
    expect(
      buildPaymentDeeplink({ method: 'venmo', amount: 33.34, handle: '@meech', isIos: false }),
    ).toMatchObject({
      appUrl: 'venmo://paycharge?txn=pay&recipients=meech&amount=33.34&note=Trip%20expense',
      webUrl: 'https://venmo.com/meech?txn=pay&amount=33.34&note=Trip%20expense',
      displayHandle: '@meech',
      canOpenDirectly: true,
    });
  });

  it('builds Cash App and PayPal URLs from identifiers instead of display names', () => {
    expect(
      buildPaymentDeeplink({ method: 'cashapp', amount: 12, handle: '$cashuser', isIos: false })
        ?.webUrl,
    ).toBe('https://cash.app/$cashuser/12.00');

    expect(
      buildPaymentDeeplink({ method: 'paypal', amount: 12, handle: 'paypal-slug', isIos: false })
        ?.webUrl,
    ).toBe('https://paypal.me/paypal-slug/12.00');
  });

  it('treats Zelle as copy-first and Apple Cash as iOS-only', () => {
    expect(
      buildPaymentDeeplink({ method: 'zelle', amount: 20, handle: '555-123-4567', isIos: false }),
    ).toMatchObject({
      appUrl: null,
      webUrl: 'https://www.zellepay.com',
      displayHandle: '555-123-4567',
      canOpenDirectly: false,
    });

    expect(
      buildPaymentDeeplink({
        method: 'applecash',
        amount: 20,
        handle: '555-123-4567',
        isIos: false,
      }),
    ).toBeNull();

    expect(
      buildPaymentDeeplink({ method: 'applecash', amount: 20, handle: '555-123-4567', isIos: true })
        ?.appUrl,
    ).toBe('sms:&body=Trip%20expense%3A%2020.00');
  });
});
