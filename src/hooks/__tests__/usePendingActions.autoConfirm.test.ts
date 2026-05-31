import { describe, expect, it } from 'vitest';
import { type PendingAction, selectAutoConfirmPendingActions } from '../usePendingActions';

function pendingAction(overrides: Partial<PendingAction>): PendingAction {
  return {
    id: 'action-1',
    trip_id: 'trip-1',
    user_id: 'user-1',
    tool_name: 'createTask',
    tool_call_id: null,
    payload: {},
    status: 'pending',
    source_type: 'ai_concierge',
    created_at: '2026-01-01T00:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

describe('selectAutoConfirmPendingActions', () => {
  it('selects only current-user pending actions that are not already handled', () => {
    const actions = [
      pendingAction({ id: 'mine' }),
      pendingAction({ id: 'other-user', user_id: 'user-2' }),
      pendingAction({ id: 'confirmed', status: 'confirmed' }),
      pendingAction({ id: 'seen' }),
      pendingAction({ id: 'in-flight' }),
    ];

    const selected = selectAutoConfirmPendingActions(
      actions,
      'user-1',
      new Set(['seen']),
      new Set(['in-flight']),
    );

    expect(selected.map(action => action.id)).toEqual(['mine']);
  });

  it('does not select actions when there is no current user', () => {
    expect(
      selectAutoConfirmPendingActions(
        [pendingAction({ id: 'mine' })],
        undefined,
        new Set(),
        new Set(),
      ),
    ).toEqual([]);
  });
});
