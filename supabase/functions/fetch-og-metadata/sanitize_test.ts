import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { sanitizeUrl } from './index.ts';

Deno.test('sanitizeUrl: passes through clean URLs', () => {
  assertEquals(sanitizeUrl('https://example.com/path'), 'https://example.com/path');
});

Deno.test('sanitizeUrl: strips surrounding double quotes', () => {
  assertEquals(sanitizeUrl('"https://example.com"'), 'https://example.com');
});

Deno.test('sanitizeUrl: strips surrounding single quotes', () => {
  assertEquals(sanitizeUrl("'https://example.com'"), 'https://example.com');
});

Deno.test('sanitizeUrl: unwraps markdown link syntax', () => {
  assertEquals(
    sanitizeUrl('[Mt Fuji Tour](https://www.viator.com/tours/Tokyo/x/d334-2142F_H1)'),
    'https://www.viator.com/tours/Tokyo/x/d334-2142F_H1',
  );
});

Deno.test('sanitizeUrl: unwraps angle-bracketed URLs', () => {
  assertEquals(sanitizeUrl('<https://example.com>'), 'https://example.com');
});

Deno.test('sanitizeUrl: decodes HTML entities', () => {
  assertEquals(
    sanitizeUrl('https://example.com/?a=1&amp;b=2'),
    'https://example.com/?a=1&b=2',
  );
});

Deno.test('sanitizeUrl: decodes numeric HTML entities', () => {
  assertEquals(
    sanitizeUrl('https://example.com/?a=1&#38;b=2'),
    'https://example.com/?a=1&b=2',
  );
});

Deno.test('sanitizeUrl: strips trailing punctuation', () => {
  assertEquals(sanitizeUrl('https://example.com.'), 'https://example.com');
  assertEquals(sanitizeUrl('https://example.com,'), 'https://example.com');
});

Deno.test('sanitizeUrl: strips unmatched trailing closing brackets', () => {
  assertEquals(sanitizeUrl('https://example.com/path)'), 'https://example.com/path');
  assertEquals(sanitizeUrl('https://willerexpress.com/en/))'), 'https://willerexpress.com/en/');
});

Deno.test('sanitizeUrl: preserves matched brackets in path', () => {
  assertEquals(
    sanitizeUrl('https://example.com/wiki/Foo_(bar)'),
    'https://example.com/wiki/Foo_(bar)',
  );
});

Deno.test('sanitizeUrl: idempotent on clean URLs', () => {
  const clean = 'https://example.com/path?a=1&b=2';
  assertEquals(sanitizeUrl(sanitizeUrl(clean)), clean);
});

Deno.test('sanitizeUrl: handles combined paste artifacts', () => {
  assertEquals(
    sanitizeUrl('"[Foo](https://example.com/?a=1&amp;b=2)."'),
    'https://example.com/?a=1&b=2',
  );
});
