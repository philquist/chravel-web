import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageActions } from '../MessageActions';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MessageActions stream mutation callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes stream onEdit only once', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-1"
        messageContent="hello"
        messageType="trip"
        isOwnMessage
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Edit'));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('msg-1', 'updated');
  });

  it('invokes stream onDelete only once', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-2"
        messageContent="hello"
        messageType="trip"
        isOwnMessage
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Delete'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('msg-2');
  });

  it('shows one error toast and no success toast when stream edit fails', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn().mockRejectedValue(new Error('Edit denied'));

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-edit-fail"
        messageContent="hello"
        messageType="trip"
        isOwnMessage
        onEdit={onEdit}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Edit'));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Edit denied');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows one error toast and no success toast when stream delete fails', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error('Delete denied'));

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-delete-fail"
        messageContent="hello"
        messageType="trip"
        isOwnMessage
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Delete'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Delete denied');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows delete for own messages when delete-any is granted without delete-own', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-delete-any-own"
        messageContent="hello"
        messageType="trip"
        isOwnMessage
        canDeleteOwnMessage={false}
        canDeleteAnyMessage
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Delete'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith('msg-delete-any-own');
  });

  it('shows Pin in stream mode and invokes pin callback when moderators can manage pins', async () => {
    const user = userEvent.setup();
    const onTogglePin = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-3"
        messageContent="hello"
        messageType="trip"
        isOwnMessage={false}
        canManagePins
        isPinned={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onTogglePin={onTogglePin}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Pin'));

    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onTogglePin).toHaveBeenCalledWith('msg-3', true);
  });

  it('shows one error toast and no success toast when stream pin fails', async () => {
    const user = userEvent.setup();
    const onTogglePin = vi.fn().mockRejectedValue(new Error('Pin denied'));

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-pin-fail"
        messageContent="hello"
        messageType="trip"
        isOwnMessage={false}
        canManagePins
        isPinned={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onTogglePin={onTogglePin}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Pin'));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Pin denied');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows Unpin in stream mode for pinned messages and invokes unpin callback', async () => {
    const user = userEvent.setup();
    const onTogglePin = vi.fn().mockResolvedValue(undefined);

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-4"
        messageContent="hello"
        messageType="trip"
        isOwnMessage={false}
        canManagePins
        isPinned
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onTogglePin={onTogglePin}
      />,
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Unpin'));

    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onTogglePin).toHaveBeenCalledWith('msg-4', false);
  });

  it('hides pin actions in stream mode when user lacks pin capability', async () => {
    const user = userEvent.setup();

    render(
      <MessageActions
        transportMode="stream"
        messageId="msg-5"
        messageContent="hello"
        messageType="trip"
        isOwnMessage={false}
        canManagePins={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onTogglePin={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(screen.queryByText('Pin')).not.toBeInTheDocument();
    expect(screen.queryByText('Unpin')).not.toBeInTheDocument();
  });
});
