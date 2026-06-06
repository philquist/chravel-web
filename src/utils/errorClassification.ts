/**
 * Shared error classification.
 *
 * Single source of truth for bucketing a raw Supabase / PostgREST / network / JS error into a
 * coarse category. Consumers map the category to whatever they need (a user-facing toast in
 * channelErrors.ts, a diagnostic log field in useTripDetailData). Centralizing the matching means
 * Postgres codes (42501, 23503, PGRST116, …) and HTTP statuses are recognized consistently rather
 * than each call site re-deriving them from `error.message` substrings (which often omit them).
 */

export type ErrorCategory =
  | 'permission-denied'
  | 'foreign-key'
  | 'validation'
  | 'not-found'
  | 'rate-limit'
  | 'network'
  | 'auth-required'
  | 'malformed'
  | 'unknown';

interface StructuredError {
  code?: string;
  message?: string;
  details?: string;
  status?: number;
}

/**
 * Classify a raw error into a single category. Order matters: more specific structured signals
 * (Postgres codes, HTTP status) and the historically-checked channel cases come first.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (error == null) return 'unknown';

  const e = error as StructuredError;
  const code = e.code ?? '';
  const message = e.message ?? '';
  const details = e.details ?? '';
  const status = e.status;
  const combined = `${code} ${message} ${details}`.toLowerCase();
  const isTypeErrorFetch = error instanceof TypeError && message.toLowerCase().includes('fetch');

  // --- Permission / RLS ---
  if (
    code === '42501' ||
    code === '42000' ||
    status === 403 ||
    combined.includes('row-level security') ||
    combined.includes('permission denied') ||
    combined.includes('new row violates') ||
    combined.includes('forbidden') ||
    combined.includes('rls')
  ) {
    return 'permission-denied';
  }

  // --- Foreign key (referenced row missing / deleted) ---
  if (
    code === '23503' ||
    combined.includes('violates foreign key') ||
    combined.includes('not present in table')
  ) {
    return 'foreign-key';
  }

  // --- Not-null / validation constraints ---
  if (code === '23502' || combined.includes('null value in column')) {
    return 'validation';
  }

  // --- Not found / no rows ---
  if (
    code === 'PGRST116' ||
    status === 404 ||
    combined.includes('not found') ||
    combined.includes('no rows')
  ) {
    return 'not-found';
  }

  // --- Rate limit (checked before network: 429 must not fall into the network bucket) ---
  if (status === 429 || combined.includes('rate limit')) {
    return 'rate-limit';
  }

  // --- Network / timeout / service unavailable ---
  if (
    status === 0 ||
    status === 503 ||
    combined.includes('fetch') ||
    combined.includes('networkerror') ||
    combined.includes('timeout') ||
    combined.includes('aborted') ||
    combined.includes('econnrefused') ||
    isTypeErrorFetch
  ) {
    return 'network';
  }

  // --- Auth required (not authenticated) ---
  if (combined.includes('auth_required') || combined.includes('not authenticated')) {
    return 'auth-required';
  }

  // --- Malformed / parse errors ---
  if (combined.includes('json') || combined.includes('parse') || combined.includes('unexpected')) {
    return 'malformed';
  }

  return 'unknown';
}
