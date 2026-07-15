import { describe, expect, it } from 'vitest';
import { tabForPush } from '../NativePushRouter';

describe('NativePushRouter tab mapping', () => {
  it.each([
    [{ type: 'payment' }, 'payments'],
    [{ type: 'broadcast' }, 'broadcasts'],
    [{ type: 'basecamp' }, 'places'],
    [{ type: 'join_request' }, 'collaborators'],
    [{ type: 'pin' }, 'chat'],
    [{ type: 'poll', pollId: 'p1' }, 'polls'],
    [{ type: 'task', taskId: 't1' }, 'tasks'],
    [{ type: 'calendar', eventId: 'e1' }, 'calendar'],
  ] as const)('maps %j to tab %s', (data, expected) => {
    expect(tabForPush(data)).toBe(expected);
  });
});
