import type { ReservationData, SmartImportCandidate } from './types';

export type ArtifactKind = 'email' | 'pdf' | 'link';

export type ImportValidationErrorCode =
  | 'MALFORMED_PAYLOAD'
  | 'UNSUPPORTED_ARTIFACT_TYPE'
  | 'PARTIAL_PARSE'
  | 'MISSING_REQUIRED_FIELDS'
  | 'DUPLICATE_CANDIDATE'
  | 'LOW_CONFIDENCE';

export interface ImportValidationError {
  code: ImportValidationErrorCode;
  message: string;
}

export interface CandidateValidationResult {
  valid: boolean;
  confidence: number;
  errors: ImportValidationError[];
}

const MIN_AUTO_CONFIRM_CONFIDENCE = 0.65;

function coerceConfidence(data: ReservationData): number {
  const score = data._relevance_score;
  if (typeof score === 'number' && Number.isFinite(score)) return Math.max(0, Math.min(1, score));
  return 0.5;
}

function requiredFieldsForType(type?: string): string[] {
  switch (type) {
    case 'flight':
      return ['departure_city', 'arrival_city'];
    case 'lodging':
      return ['property_name'];
    case 'event_ticket':
    case 'sports_ticket':
      return ['event_name'];
    default:
      return [];
  }
}

export function validateCandidate(
  candidate: SmartImportCandidate,
  kind: ArtifactKind,
  seenIds: Set<string>,
): CandidateValidationResult {
  const data = candidate.reservation_data || {};
  const errors: ImportValidationError[] = [];

  if (seenIds.has(candidate.id)) {
    errors.push({
      code: 'DUPLICATE_CANDIDATE',
      message: 'Duplicate candidate in this import batch.',
    });
  }

  if (!data || typeof data !== 'object') {
    errors.push({ code: 'MALFORMED_PAYLOAD', message: 'Candidate payload is malformed.' });
  }

  if (kind === 'pdf' && !data.type) {
    errors.push({
      code: 'UNSUPPORTED_ARTIFACT_TYPE',
      message: 'PDF did not produce a supported reservation type.',
    });
  }

  const confidence = coerceConfidence(data);
  if (confidence < MIN_AUTO_CONFIRM_CONFIDENCE) {
    errors.push({
      code: 'LOW_CONFIDENCE',
      message: 'Low extraction confidence. Manual confirmation required.',
    });
  }

  const required = requiredFieldsForType(data.type);
  const missing = required.filter(field => !data[field]);
  if (missing.length > 0) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELDS',
      message: `Missing required fields: ${missing.join(', ')}`,
    });
    errors.push({
      code: 'PARTIAL_PARSE',
      message: 'Partial parse detected; review before commit.',
    });
  }

  return { valid: errors.length === 0, errors, confidence };
}

export function detectArtifactKind(source?: string): ArtifactKind {
  if (source === 'url' || source === 'text') return 'link';
  if (source === 'file') return 'pdf';
  return 'email';
}
