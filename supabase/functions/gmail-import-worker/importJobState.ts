export type ImportCheckpointPhase = 'source_fetched' | 'artifacts_stored' | 'applied_reviewed';

export interface StoredArtifact {
  gmailMessageId: string;
  artifactFingerprint: string;
  artifactPayload: Record<string, unknown>;
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export async function buildArtifactFingerprint(
  messageId: string,
  reservation: Record<string, unknown>,
): Promise<string> {
  const seed = JSON.stringify({
    messageId,
    type: text(reservation.type),
    confirmationCode: text(reservation.confirmation_code),
    bookingSource: text(reservation.booking_source),
    departure: text(reservation.departure_time_local),
    checkIn: text(reservation.check_in_local),
    startTime: text(reservation.start_time_local),
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function buildCandidateDedupeKey(messageId: string, artifactFingerprint: string): string {
  return `${messageId}:${artifactFingerprint}`;
}

export function nextPhase({
  hasFetchedSource,
  hasStoredArtifacts,
  hasAppliedArtifacts,
}: {
  hasFetchedSource: boolean;
  hasStoredArtifacts: boolean;
  hasAppliedArtifacts: boolean;
}): ImportCheckpointPhase {
  if (!hasFetchedSource) return 'source_fetched';
  if (!hasStoredArtifacts) return 'source_fetched';
  if (!hasAppliedArtifacts) return 'artifacts_stored';
  return 'applied_reviewed';
}

export interface GmailImportStats {
  parsed?: number;
  skipped?: number;
  errors?: number;
}

export type GmailImportTerminalStatus = 'completed' | 'completed_partial' | 'failed';

export function resolveTerminalImportStatus(stats: GmailImportStats): GmailImportTerminalStatus {
  const parsed = stats.parsed ?? 0;
  const skipped = stats.skipped ?? 0;
  const errors = stats.errors ?? 0;
  const successfulOrSkipped = parsed + skipped;

  if (errors > 0 && successfulOrSkipped > 0) return 'completed_partial';
  if (errors > 0) return 'failed';
  return 'completed';
}
