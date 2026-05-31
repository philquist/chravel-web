import { describe, expect, it } from 'vitest';
import { tripKeys } from '@/lib/queryKeys';

describe('tripKeys', () => {
  it('scopes trip detail cache by user identity', () => {
    expect(tripKeys.detailForUser('trip-1', 'user-1')).toEqual(['trip', 'trip-1', 'user-1']);
  });

  it('keeps member revision keys under the canonical members prefix', () => {
    expect(tripKeys.membersWithRevision('trip-1', 2)).toEqual(['trip-members', 'trip-1', 2]);
    expect(tripKeys.membersWithRevision('trip-1', 2).slice(0, 2)).toEqual(
      tripKeys.members('trip-1'),
    );
  });
});
