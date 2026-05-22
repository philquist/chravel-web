const ALLOWED_SCHEMES = new Set(['https:', 'http:', 'tel:', 'mailto:']);

export function sanitizeDeepLink(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
