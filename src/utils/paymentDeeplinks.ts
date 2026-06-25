import { PaymentMethod } from '../types/receipts';
import { PAYMENT_METHOD_DISPLAY_NAMES } from '../types/paymentMethods';

export interface PaymentDeeplinkRequest {
  method: PaymentMethod;
  amount: number;
  handle: string;
  note?: string;
  isIos?: boolean;
}

export interface PaymentDeeplinkTarget {
  method: PaymentMethod;
  appUrl: string | null;
  webUrl: string | null;
  displayHandle: string;
  canOpenDirectly: boolean;
}

const DEFAULT_PAYMENT_NOTE = 'Trip expense';

const stripLeadingPaymentHandleSymbol = (handle: string, symbols: string[]): string => {
  let normalized = handle.trim();
  while (symbols.some(symbol => normalized.startsWith(symbol))) {
    normalized = normalized.slice(1).trim();
  }
  return normalized;
};

export const isIosUserAgent = (
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean =>
  /iPad|iPhone|iPod/.test(userAgent) ||
  (userAgent.includes('Macintosh') &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 1);

export const buildPaymentDeeplink = ({
  method,
  amount,
  handle,
  note = DEFAULT_PAYMENT_NOTE,
  isIos = isIosUserAgent(),
}: PaymentDeeplinkRequest): PaymentDeeplinkTarget | null => {
  const formattedAmount = amount.toFixed(2);
  const trimmedHandle = handle.trim();
  const encodedNote = encodeURIComponent(note);

  if (!trimmedHandle) return null;

  switch (method) {
    case 'venmo': {
      const venmoHandle = stripLeadingPaymentHandleSymbol(trimmedHandle, ['@']);
      if (!venmoHandle) return null;
      const encodedHandle = encodeURIComponent(venmoHandle);
      return {
        method,
        appUrl: `venmo://paycharge?txn=pay&recipients=${encodedHandle}&amount=${formattedAmount}&note=${encodedNote}`,
        webUrl: `https://venmo.com/${encodedHandle}?txn=pay&amount=${formattedAmount}&note=${encodedNote}`,
        displayHandle: `@${venmoHandle}`,
        canOpenDirectly: true,
      };
    }

    case 'cashapp': {
      const cashtag = stripLeadingPaymentHandleSymbol(trimmedHandle, ['$']);
      if (!cashtag) return null;
      return {
        method,
        appUrl: null,
        webUrl: `https://cash.app/$${encodeURIComponent(cashtag)}/${formattedAmount}`,
        displayHandle: `$${cashtag}`,
        canOpenDirectly: true,
      };
    }

    case 'paypal': {
      const paypalSlug = stripLeadingPaymentHandleSymbol(trimmedHandle, ['@']);
      if (!paypalSlug) return null;
      return {
        method,
        appUrl: null,
        webUrl: `https://paypal.me/${encodeURIComponent(paypalSlug)}/${formattedAmount}`,
        displayHandle: paypalSlug,
        canOpenDirectly: true,
      };
    }

    case 'zelle':
      return {
        method,
        appUrl: null,
        webUrl: 'https://www.zellepay.com',
        displayHandle: trimmedHandle,
        canOpenDirectly: false,
      };

    case 'applecash':
      if (!isIos) return null;
      return {
        method,
        appUrl: `sms:&body=${encodeURIComponent(`${note}: ${formattedAmount}`)}`,
        webUrl: null,
        displayHandle: trimmedHandle,
        canOpenDirectly: true,
      };

    default:
      return null;
  }
};

export const generatePaymentDeeplink = (
  method: PaymentMethod,
  amount: number,
  handle: string,
): string | null => {
  const target = buildPaymentDeeplink({ method, amount, handle });
  return target?.appUrl ?? target?.webUrl ?? null;
};

export const getPaymentMethodDisplayName = (method: PaymentMethod | string): string => {
  const key = typeof method === 'string' ? method.toLowerCase() : String(method);
  return PAYMENT_METHOD_DISPLAY_NAMES[key] ?? method;
};
