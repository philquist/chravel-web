import { describe, expect, it } from 'vitest';
import {
  buildArtifactFingerprint,
  buildCandidateDedupeKey,
  nextPhase,
  resolveTerminalImportStatus,
} from '../importJobState.ts';

describe('import job durable state helpers', () => {
  it('fingerprint is stable and dedupe key includes message id', async () => {
    const reservation = {
      type: 'flight',
      confirmation_code: 'ABC123',
      booking_source: 'delta',
      departure_time_local: '2026-08-01T08:00:00',
    };
    const a = await buildArtifactFingerprint('msg-1', reservation);
    const b = await buildArtifactFingerprint('msg-1', { ...reservation });
    const c = await buildArtifactFingerprint('msg-2', reservation);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(buildCandidateDedupeKey('msg-1', a)).toBe(`msg-1:${a}`);
  });

  it('checkpoint phase resumes from last durable step', () => {
    expect(
      nextPhase({ hasFetchedSource: true, hasStoredArtifacts: false, hasAppliedArtifacts: false }),
    ).toBe('source_fetched');
    expect(
      nextPhase({ hasFetchedSource: true, hasStoredArtifacts: true, hasAppliedArtifacts: false }),
    ).toBe('artifacts_stored');
    expect(
      nextPhase({ hasFetchedSource: true, hasStoredArtifacts: true, hasAppliedArtifacts: true }),
    ).toBe('applied_reviewed');
  });

  it('marks mixed Gmail import failures as completed_partial', () => {
    expect(resolveTerminalImportStatus({ parsed: 4, skipped: 1, errors: 0 })).toBe('completed');
    expect(resolveTerminalImportStatus({ parsed: 4, skipped: 1, errors: 2 })).toBe(
      'completed_partial',
    );
    expect(resolveTerminalImportStatus({ parsed: 0, skipped: 0, errors: 2 })).toBe('failed');
  });
});
