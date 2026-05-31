import { describe, it, expect, vi } from 'vitest';
import {
  classifyAttachmentFile,
  normalizePaymentUrl,
  validatePaymentFileSize,
  PaymentAttachmentError,
  MAX_PAYMENT_ATTACHMENT_BYTES,
} from '../paymentAttachmentService';

// The service imports the Supabase client at module load; stub it so import is side-effect free.
vi.mock('../../integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), storage: { from: vi.fn() } },
}));

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  // jsdom File size reflects content; override for size-limit tests.
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

describe('classifyAttachmentFile', () => {
  it('classifies common images as image', () => {
    expect(classifyAttachmentFile(makeFile('r.jpg', 'image/jpeg')).type).toBe('image');
    expect(classifyAttachmentFile(makeFile('r.png', 'image/png')).type).toBe('image');
    expect(classifyAttachmentFile(makeFile('r.webp', 'image/webp')).type).toBe('image');
  });

  it('classifies PDFs and text as file', () => {
    expect(classifyAttachmentFile(makeFile('receipt.pdf', 'application/pdf')).type).toBe('file');
    expect(classifyAttachmentFile(makeFile('note.txt', 'text/plain')).type).toBe('file');
  });

  it('infers type from extension when the browser omits File.type', () => {
    expect(classifyAttachmentFile(makeFile('receipt.pdf', '')).type).toBe('file');
    expect(classifyAttachmentFile(makeFile('photo.jpg', '')).type).toBe('image');
  });

  it('rejects HEIC with an actionable message', () => {
    expect(() => classifyAttachmentFile(makeFile('IMG_0001.heic', 'image/heic'))).toThrow(
      PaymentAttachmentError,
    );
    // Even when the MIME is blank, the .heic extension is rejected.
    expect(() => classifyAttachmentFile(makeFile('IMG_0001.HEIC', ''))).toThrow(/HEIC/i);
  });

  it('rejects unsupported types', () => {
    expect(() => classifyAttachmentFile(makeFile('a.exe', 'application/x-msdownload'))).toThrow(
      PaymentAttachmentError,
    );
    expect(() => classifyAttachmentFile(makeFile('a.zip', 'application/zip'))).toThrow(
      /Unsupported file type/i,
    );
  });
});

describe('validatePaymentFileSize', () => {
  it('accepts files at or below 10MB', () => {
    expect(() =>
      validatePaymentFileSize(makeFile('a.pdf', 'application/pdf', 5_000_000)),
    ).not.toThrow();
    expect(() =>
      validatePaymentFileSize(makeFile('a.pdf', 'application/pdf', MAX_PAYMENT_ATTACHMENT_BYTES)),
    ).not.toThrow();
  });

  it('rejects files over 10MB with a clear message', () => {
    expect(() =>
      validatePaymentFileSize(
        makeFile('big.pdf', 'application/pdf', MAX_PAYMENT_ATTACHMENT_BYTES + 1),
      ),
    ).toThrow(/10MB or smaller/i);
  });
});

describe('normalizePaymentUrl', () => {
  it('adds https when missing', () => {
    expect(normalizePaymentUrl('example.com/booking')).toBe('https://example.com/booking');
  });

  it('preserves existing protocol and strips tracking params', () => {
    expect(normalizePaymentUrl('https://shop.com/order?utm_source=x&id=9')).toBe(
      'https://shop.com/order?id=9',
    );
  });

  it('lowercases the hostname', () => {
    expect(normalizePaymentUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('rejects empty input', () => {
    expect(() => normalizePaymentUrl('   ')).toThrow(PaymentAttachmentError);
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => normalizePaymentUrl('javascript:alert(1)')).toThrow(/http/i);
    expect(() => normalizePaymentUrl('ftp://files.example.com')).toThrow(/http/i);
  });

  it('rejects strings without a dotted host', () => {
    expect(() => normalizePaymentUrl('not a url')).toThrow(PaymentAttachmentError);
    expect(() => normalizePaymentUrl('localhost')).toThrow(PaymentAttachmentError);
  });
});
