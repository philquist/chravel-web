import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageActions } from '../MessageActions';

describe('MessageActions reply labels', () => {
  it('renders a single Reply action (no separate thread modal action)', () => {
    render(
      <MessageActions
        messageId="m-1"
        messageContent="hello"
        messageType="trip"
        isOwnMessage={false}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button'));

    expect(screen.getByText('Reply')).toBeInTheDocument();
    expect(screen.queryByText('Reply in thread')).not.toBeInTheDocument();
    expect(screen.queryByText('View thread')).not.toBeInTheDocument();
    expect(screen.queryByText('Open thread')).not.toBeInTheDocument();
  });
});
