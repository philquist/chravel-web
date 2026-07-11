import { describe, it, expect } from 'vitest';
import { isAgendaVersionConflict, AGENDA_VERSION_CONFLICT_MESSAGE } from '@/hooks/useEventAgenda';

describe('isAgendaVersionConflict', () => {
  it('detects the Postgres P0001 version-conflict error code', () => {
    expect(isAgendaVersionConflict({ code: 'P0001', message: 'anything' })).toBe(true);
  });

  it('detects the conflict by message when the code is absent', () => {
    expect(
      isAgendaVersionConflict({
        message: 'Agenda item was modified by another user (expected version 1, found 2)',
      }),
    ).toBe(true);
  });

  it('does not treat unrelated errors as conflicts', () => {
    expect(isAgendaVersionConflict({ code: '42501', message: 'Access denied' })).toBe(false);
    expect(isAgendaVersionConflict({ code: 'P0002', message: 'Agenda item not found' })).toBe(
      false,
    );
    expect(isAgendaVersionConflict(null)).toBe(false);
  });

  it('exposes a user-facing, non-destructive conflict message', () => {
    expect(AGENDA_VERSION_CONFLICT_MESSAGE).toMatch(/another organizer/i);
    expect(AGENDA_VERSION_CONFLICT_MESSAGE).toMatch(/reapply/i);
  });
});
