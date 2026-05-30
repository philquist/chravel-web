import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminDashboard } from '../AdminDashboard';

const getScheduledMessagesMock = vi.fn();
const useFeatureFlagMock = vi.fn();

vi.mock('@/hooks/useProTrips', () => ({
  useProTrips: () => ({
    data: [],
    proTrips: [],
  }),
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: (...args: unknown[]) => useFeatureFlagMock(...args),
}));

vi.mock('@/services/unifiedMessagingService', () => ({
  unifiedMessagingService: {
    getScheduledMessages: (...args: unknown[]) => getScheduledMessagesMock(...args),
    scheduleMessage: vi.fn(),
  },
}));

describe('AdminDashboard broadcast scheduling copy reflects flag state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getScheduledMessagesMock.mockResolvedValue([]);
  });

  it('shows unavailable copy and disables schedule action when scheduling flag is off', async () => {
    useFeatureFlagMock.mockReturnValue(false);

    render(<AdminDashboard />);

    expect(
      await screen.findByText(
        'Scheduled messages for Pro Trips are temporarily unavailable while scheduling is disabled.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Schedule Pro Trip Message' })).toBeDisabled();
    expect(getScheduledMessagesMock).not.toHaveBeenCalled();
  });

  it('shows actionable copy and enables schedule action when scheduling flag is on', async () => {
    useFeatureFlagMock.mockReturnValue(true);

    render(<AdminDashboard />);

    // Truthful copy when enabled — no lingering "temporarily unavailable" message.
    expect(
      await screen.findByText(
        'Schedule a broadcast to be sent to a Pro Trip at a future date and time.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Scheduled messages for Pro Trips are temporarily unavailable while scheduling is disabled.',
      ),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Schedule Pro Trip Message' })).toBeEnabled();
  });
});
