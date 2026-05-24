import { invokeFunctionWithRetry } from './supabaseFunctionClient';

interface EnhancedParserResponse {
  parsed_data?: any;
  extracted_data?: any;
  todos?: any[];
}

export async function invokeEnhancedAiParser(body: Record<string, unknown>) {
  return invokeFunctionWithRetry<EnhancedParserResponse>('enhanced-ai-parser', body, {
    retries: 1,
  });
}
