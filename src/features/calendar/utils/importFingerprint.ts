/**
 * Stable fingerprints for Smart Import idempotency and duplicate detection.
 */

export interface ImportFingerprintInput {
  title: string;
  startTime: Date | string;
  endTime?: Date | string | null;
  location?: string | null;
  sourceFormat?: string;
  sourceUrl?: string | null;
  externalUid?: string | null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLocation(location?: string | null): string {
  if (!location) return '';
  return location
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIsoMinute(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

/** Simple stable hash for browser environments (not cryptographic). */
export function hashFingerprintSeed(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Prefer stable external UIDs when present. Otherwise derive from normalized
 * title + start minute + location + optional source identity.
 */
export function buildImportFingerprint(input: ImportFingerprintInput): string {
  const external = input.externalUid?.trim();
  if (external && !external.startsWith('imported-')) {
    return `uid:${external}`;
  }

  const seed = [
    normalizeTitle(input.title),
    toIsoMinute(input.startTime),
    toIsoMinute(input.endTime ?? null),
    normalizeLocation(input.location),
    input.sourceFormat ?? '',
    (input.sourceUrl ?? '').toLowerCase(),
  ].join('|');

  return `fp:${hashFingerprintSeed(seed)}`;
}

/**
 * Batch-level idempotency key so retries of the same source commit do not
 * create a second durable import batch.
 */
export function buildImportBatchIdempotencyKey(input: {
  tripId: string;
  sourceFormat: string;
  sourceUrl?: string | null;
  eventFingerprints: string[];
}): string {
  const sorted = [...input.eventFingerprints].sort();
  const seed = [
    input.tripId,
    input.sourceFormat,
    (input.sourceUrl ?? '').toLowerCase(),
    sorted.join(','),
  ].join('::');
  return `batch:${hashFingerprintSeed(seed)}:${sorted.length}`;
}
