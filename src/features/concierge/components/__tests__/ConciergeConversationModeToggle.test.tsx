import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConciergeConversationModeToggle } from '../ConciergeConversationModeToggle';

const useFeatureFlagMock = vi.fn();
const useConversationModePreferenceMock = vi.fn();

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: (...args: unknown[]) => useFeatureFlagMock(...args),
}));

vi.mock('@/features/concierge/hooks/useConversationModePreference', () => ({
  useConversationModePreference: () => useConversationModePreferenceMock(),
}));

describe('ConciergeConversationModeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConversationModePreferenceMock.mockReturnValue({
      enabled: true,
      setEnabled: vi.fn(),
    });
  });

  it('renders nothing when concierge_conversation_mode flag is off (App Store path)', () => {
    useFeatureFlagMock.mockReturnValue(false);

    const { container } = render(<ConciergeConversationModeToggle />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Conversation Mode')).not.toBeInTheDocument();
    expect(useFeatureFlagMock).toHaveBeenCalledWith('concierge_conversation_mode', false);
  });

  it('renders the toggle when concierge_conversation_mode flag is on', () => {
    useFeatureFlagMock.mockReturnValue(true);

    render(<ConciergeConversationModeToggle />);

    expect(screen.getByText('Conversation Mode')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /hands-free conversation mode/i }),
    ).toBeInTheDocument();
  });
});
