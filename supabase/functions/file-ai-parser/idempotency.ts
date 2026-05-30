export interface ExistingFileAiExtraction {
  id?: string;
  file_id?: string;
  extraction_type?: string;
  extracted_data?: unknown;
  confidence_score?: number | null;
  created_at?: string;
}

export const buildFileExtractionIdempotencyKey = (fileId: string, extractionType: string): string =>
  `${fileId}:${extractionType}`;

export const createCachedExtractionPayload = (extraction: ExistingFileAiExtraction) => ({
  success: true,
  cached: true,
  extraction,
  extracted_data: extraction.extracted_data ?? null,
  confidence_score: extraction.confidence_score ?? null,
});
