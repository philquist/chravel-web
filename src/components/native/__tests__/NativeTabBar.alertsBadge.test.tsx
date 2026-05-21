import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NativeTabBar } from '../NativeTabBar';

vi.mock('@/hooks/useOrientationTransition', () => ({
  useOrientationTransition: () => ({ isMobile: true, isTransitioning: false }),
}));

vi.mock('@/services/hapticService', () => ({
  hapticService: {
    medium: vi.fn().mockResolvedValue(undefined),
    light: vi.fn().mockResolvedValue(undefined),
    selectionChanged: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('NativeTabBar alerts badge', () => {
  it('renders alert badge when alertsBadge > 0', () => {
    render(
      <NativeTabBar
        activeTab="trips"
        onTabChange={() => {}}
        alertsBadge={7}
        onNewPress={() => {}}
        onSearchPress={() => {}}
      />,
    );

    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('caps alert badge text at 99+', () => {
    render(
      <NativeTabBar
        activeTab="trips"
        onTabChange={() => {}}
        alertsBadge={150}
        onNewPress={() => {}}
        onSearchPress={() => {}}
      />,
    );

    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});
