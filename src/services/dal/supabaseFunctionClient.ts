import { supabase } from '@/integrations/supabase/client';

export interface ServiceErrorEnvelope {
  code: string;
  message: string;
  retryable: boolean;
  status?: number;
  details?: unknown;
}

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const toEnvelope = (error: unknown): ServiceErrorEnvelope => {
  if (error instanceof Error) {
    const status = Number((error as Error & { context?: { status?: number } }).context?.status);
    return {
      code: 'SUPABASE_FUNCTION_ERROR',
      message: error.message,
      retryable: !Number.isFinite(status) || status >= 500,
      status: Number.isFinite(status) ? status : undefined,
      details: error,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unknown function invocation error',
    retryable: false,
    details: error,
  };
};

export async function invokeFunctionWithRetry<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
  options: RetryOptions = {},
): Promise<{ data: TResponse | null; error: ServiceErrorEnvelope | null }> {
  const retries = options.retries ?? 1;
  const baseDelayMs = options.baseDelayMs ?? 250;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data, error } = await supabase.functions.invoke(functionName, { body });

    if (!error) {
      return { data: (data as TResponse) ?? null, error: null };
    }

    const envelope = toEnvelope(error);
    const shouldRetry = envelope.retryable && attempt < retries;

    if (!shouldRetry) {
      return { data: null, error: envelope };
    }

    await sleep(baseDelayMs * 2 ** attempt);
  }

  return {
    data: null,
    error: {
      code: 'UNREACHABLE_STATE',
      message: 'Function invocation loop ended unexpectedly',
      retryable: false,
    },
  };
}
