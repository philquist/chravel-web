import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteTripLinkBySource,
  getTripLinkDeleteTable,
} from '../tripLinksService';

const { deleteMock, eqMock, fromMock, selectMock } = vi.hoisted(() => {
  const selectMock = vi.fn();
  const eqMock = vi.fn(() => ({ select: selectMock }));
  const deleteMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ delete: deleteMock }));
  return { deleteMock, eqMock, fromMock, selectMock };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('trip link source-aware deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockResolvedValue({ data: [{ id: 'link-1' }], error: null });
  });

  it('routes manual links to trip_links', () => {
    expect(getTripLinkDeleteTable('manual')).toBe('trip_links');
  });

  it('routes chat and places links to trip_link_index', () => {
    expect(getTripLinkDeleteTable('chat')).toBe('trip_link_index');
    expect(getTripLinkDeleteTable('places')).toBe('trip_link_index');
  });

  it('deletes manual links from trip_links', async () => {
    await expect(
      deleteTripLinkBySource('link-1', 'trip-1', 'manual', false, { suppressToast: true }),
    ).resolves.toBe(true);

    expect(fromMock).toHaveBeenCalledWith('trip_links');
    expect(eqMock).toHaveBeenCalledWith('id', 'link-1');
  });

  it('deletes chat-indexed links from trip_link_index', async () => {
    await expect(
      deleteTripLinkBySource('link-1', 'trip-1', 'chat', false, { suppressToast: true }),
    ).resolves.toBe(true);

    expect(fromMock).toHaveBeenCalledWith('trip_link_index');
    expect(eqMock).toHaveBeenCalledWith('id', 'link-1');
  });
});
