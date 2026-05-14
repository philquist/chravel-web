import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActions } from '../MessageActions';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MessageActions reply semantics', () => {
  it('renders a single Reply action that triggers the inline reply target', async () => {
    const onReply = vi.fn();
    const onOpenThread = vi.fn();

    const user = userEvent.setup();
    render(
      <MessageActions
        messageId="msg-1"
        messageContent="hello"
        messageType="trip"
        isOwnMessage={false}
        onReply={onReply}
        onOpenThread={onOpenThread}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Reply'));

    expect(onReply).toHaveBeenCalledWith('msg-1');
    // onOpenThread is still wired to keep telemetry/scroll behavior alive
    expect(onOpenThread).toHaveBeenCalledWith('msg-1');
  });
});
