import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PendingActionCard } from '../PendingActionCard';

const baseAction = {
  id: 'a1',
  trip_id: 't1',
  user_id: 'u1',
  tool_name: 'createTask',
  tool_call_id: null,
  payload: { title: 'Test task' },
  status: 'pending' as const,
  source_type: 'ai_concierge',
  created_at: new Date().toISOString(),
  resolved_at: null,
  resolved_by: null,
};

describe('PendingActionCard confirm states', () => {
  it('calls confirm and shows success state', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <PendingActionCard
        action={baseAction}
        onConfirm={onConfirm}
        onReject={vi.fn()}
        isConfirming={false}
        isRejecting={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('a1'));
    await screen.findByText('Confirmed');
  });

  it('shows retry state when confirm fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <PendingActionCard
        action={baseAction}
        onConfirm={onConfirm}
        onReject={vi.fn()}
        isConfirming={false}
        isRejecting={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('a1'));
    await screen.findByText('Retry confirm');
    expect(screen.queryByText('Confirmed')).toBeNull();
  });
});
