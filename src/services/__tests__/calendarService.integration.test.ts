import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarService } from '../calendarService';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('../demoModeService', () => ({
  demoModeService: { isDemoModeEnabled: vi.fn().mockResolvedValue(false) },
}));

describe('calendarService - Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects overlapping events through the production conflict checker', async () => {
    vi.spyOn(calendarService, 'getTripEvents').mockResolvedValue([
      {
        id: 'event-1',
        trip_id: 'trip-1',
        title: 'Soundcheck',
        start_time: '2026-01-10T10:00:00Z',
        end_time: '2026-01-10T11:00:00Z',
      } as any,
    ]);

    await expect(
      calendarService.checkForConflicts('trip-1', '2026-01-10T10:30:00Z', '2026-01-10T11:30:00Z'),
    ).resolves.toEqual(['Soundcheck']);
  });

  it('does not treat back-to-back events as conflicts', async () => {
    vi.spyOn(calendarService, 'getTripEvents').mockResolvedValue([
      {
        id: 'event-1',
        trip_id: 'trip-1',
        title: 'Load in',
        start_time: '2026-01-10T09:00:00Z',
        end_time: '2026-01-10T10:00:00Z',
      } as any,
    ]);

    await expect(
      calendarService.checkForConflicts('trip-1', '2026-01-10T10:00:00Z', '2026-01-10T11:00:00Z'),
    ).resolves.toEqual([]);
  });
});
