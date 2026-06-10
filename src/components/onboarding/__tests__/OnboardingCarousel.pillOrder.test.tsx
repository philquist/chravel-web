import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OnboardingCarousel } from '../OnboardingCarousel';

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

describe('OnboardingCarousel pill navigation', () => {
  const scrollCalls: string[] = [];

  beforeEach(() => {
    scrollCalls.length = 0;
    vi.clearAllMocks();
    window.innerWidth = 1280;

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(function mockScrollIntoView(this: HTMLElement) {
        const pillId = this.dataset.pill;
        if (pillId) {
          scrollCalls.push(pillId);
        }
      }),
    });
  });

  it('keeps pill auto-scroll moving forward as the demo advances', async () => {
    const user = userEvent.setup();

    render(
      <OnboardingCarousel
        onComplete={vi.fn()}
        onSkip={vi.fn()}
        onExploreDemoTrip={vi.fn()}
        onCreateTrip={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Get Started' }));
    await waitFor(() => expect(scrollCalls[scrollCalls.length - 1]).toBe('chat'));

    // 10-screen flow: Welcome → Chat → Calendar → Concierge → Media →
    // Payments → Places → Polls → Tasks → Final CTA
    for (const pillId of [
      'calendar',
      'concierge',
      'media',
      'payments',
      'places',
      'polls',
      'tasks',
    ]) {
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(scrollCalls[scrollCalls.length - 1]).toBe(pillId));
    }

    const pillOrder = Array.from(document.querySelectorAll<HTMLElement>('[data-pill]')).map(
      pill => pill.dataset.pill ?? '',
    );
    const scrollIndices = scrollCalls.map(pillId => pillOrder.indexOf(pillId));

    expect(scrollCalls).toEqual([
      'chat',
      'calendar',
      'concierge',
      'media',
      'payments',
      'places',
      'polls',
      'tasks',
    ]);
    expect(scrollIndices.every(index => index >= 0)).toBe(true);
    expect(scrollIndices).toEqual([...scrollIndices].sort((a, b) => a - b));
  });
});
