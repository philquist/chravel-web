import { describe, expect, it } from 'vitest';

import { buildFileExtractionIdempotencyKey, createCachedExtractionPayload } from '../idempotency';

describe('file-ai-parser idempotency helpers', () => {
  it('uses file id and extraction type as the deterministic replay key', () => {
    expect(buildFileExtractionIdempotencyKey('file-1', 'calendar')).toBe('file-1:calendar');
    expect(buildFileExtractionIdempotencyKey('file-1', 'text')).not.toBe(
      buildFileExtractionIdempotencyKey('file-1', 'calendar'),
    );
  });

  it('returns the existing extraction payload without requiring a new usage charge', () => {
    const extraction = {
      id: 'extract-1',
      file_id: 'file-1',
      extraction_type: 'calendar',
      extracted_data: { events: [{ title: 'Dinner' }] },
      confidence_score: 0.92,
    };

    expect(createCachedExtractionPayload(extraction)).toEqual({
      success: true,
      cached: true,
      extraction,
      extracted_data: extraction.extracted_data,
      confidence_score: extraction.confidence_score,
    });
  });
});
