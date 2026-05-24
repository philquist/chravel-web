import { describe, expect, it, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

import { searchArtifactsByDomain } from '../artifactSearchService';

describe('artifactSearchService', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('maps successful envelope to results', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, results: [{ id: 'a1' }] },
      error: null,
    });

    const result = await searchArtifactsByDomain({ tripId: 't1', query: 'hotel' });
    expect(result).toEqual({ results: [{ id: 'a1' }], error: null });
  });

  it('retries once and returns mapped function error', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: null, error: new Error('network down') })
      .mockResolvedValueOnce({ data: null, error: new Error('network down') });

    const result = await searchArtifactsByDomain({ tripId: 't1', query: 'hotel' });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.results).toEqual([]);
    expect(result.error).toContain('network down');
  });
});
