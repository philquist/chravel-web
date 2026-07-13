import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OnboardingCarousel } from '../OnboardingCarousel';
import { onboardingEvents } from '@/telemetry/events';

vi.mock('@/services/hapticService', () => ({
  hapticService: {
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/telemetry/events', () => ({
  onboardingEvents: {
    screenViewed: vi.fn(),
    skipped: vi.fn(),
    completed: vi.fn(),
    demoTripSelected: vi.fn(),
  },
}));

// Ordered titles for the full 10-screen flow (Final CTA has no title).
const SCREEN_TITLES = [
  'Plan group trips without the chaos', // 0 Welcome
  'One trip. One chat.', // 1 Chat
  "Plans that don't drift.", // 2 Calendar
  'Your ChravelApp Agent.', // 3 Concierge
  'Every moment, together.', // 4 Media
  'Money, organized.', // 5 Payments
  'Pin your spots.', // 6 Places
  'Decide together.', // 7 Polls
  'Everyone knows their part.', // 8 Tasks
];

describe('OnboardingCarousel 10-screen flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.innerWidth = 1280;
    // JSDOM lacks scrollIntoView; DemoPillBar calls it on every screen change.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  const renderCarousel = () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    const onExploreDemoTrip = vi.fn();
    const onCreateTrip = vi.fn();

    render(
      <OnboardingCarousel
        onComplete={onComplete}
        onSkip={onSkip}
        onExploreDemoTrip={onExploreDemoTrip}
        onCreateTrip={onCreateTrip}
      />,
    );

    return { onComplete, onSkip, onExploreDemoTrip, onCreateTrip };
  };

  it('renders exactly 10 progress dots (one per screen)', () => {
    renderCarousel();
    expect(screen.getAllByRole('tab')).toHaveLength(10);
  });

  it('walks all 10 screens in order and fires completion', async () => {
    const user = userEvent.setup();
    const { onComplete, onCreateTrip } = renderCarousel();

    // Titles can render in both the demo screen and the desktop copy column
    // (getAllByText), and screen transitions are animated (find* queries wait).
    expect(screen.getAllByText(SCREEN_TITLES[0]).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Get Started' }));
    for (let i = 1; i < SCREEN_TITLES.length; i++) {
      expect((await screen.findAllByText(SCREEN_TITLES[i])).length).toBeGreaterThan(0);
      await user.click(screen.getByRole('button', { name: 'Continue' }));
    }

    const createTripButton = await screen.findByRole('button', {
      name: /Create Your First Trip/i,
    }); // Final CTA

    // Analytics indices stay consistent with the 10-screen array (0..9)
    expect(vi.mocked(onboardingEvents.screenViewed).mock.calls.map(call => call[0])).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);

    // Completion flag still fires through onComplete
    await user.click(createTripButton);
    expect(onboardingEvents.completed).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCreateTrip).toHaveBeenCalledTimes(1);
  });

  it('shows a Skip demo control on every non-final screen and it exits from any point', async () => {
    const user = userEvent.setup();
    const { onSkip } = renderCarousel();

    // Walk to a mid-demo screen, asserting the skip control is present on each
    await user.click(screen.getByRole('button', { name: 'Get Started' }));
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByRole('button', { name: 'Skip demo' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continue' }));
    }

    // Bail mid-demo (screen 5 = Payments)
    await user.click(screen.getByRole('button', { name: 'Skip demo' }));

    expect(onboardingEvents.skipped).toHaveBeenCalledWith(5);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('also exposes the header X skip on every screen including the final CTA', async () => {
    const user = userEvent.setup();
    const { onSkip } = renderCarousel();

    // Jump to the last screen via the progress dots
    const dots = screen.getAllByRole('tab');
    await user.click(dots[dots.length - 1]);
    await screen.findByRole('button', { name: /Create Your First Trip/i });

    await user.click(screen.getByRole('button', { name: 'Skip onboarding' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
