import { describe, expect, it } from 'vitest';
import { messageMatchesChatSearchQuery } from '../matchChatSearchQuery';

describe('messageMatchesChatSearchQuery', () => {
  it('matches message text and sender name', () => {
    expect(
      messageMatchesChatSearchQuery(
        { text: 'Meet at the lobby', sender: { name: 'Alex' } },
        'lobby',
      ),
    ).toBe(true);
    expect(
      messageMatchesChatSearchQuery(
        { text: 'See you soon', sender: { name: 'Jordan Lee' } },
        'jordan',
      ),
    ).toBe(true);
  });

  it('matches voice-note attachment transcripts when bubble text is empty', () => {
    expect(
      messageMatchesChatSearchQuery(
        {
          text: '',
          attachments: [{ transcript: 'boarding starts soon at gate twelve' }],
        },
        'gate twelve',
      ),
    ).toBe(true);
  });

  it('matches transcripts when placeholder voice-note text is used', () => {
    expect(
      messageMatchesChatSearchQuery(
        {
          text: 'Voice note',
          attachments: [{ transcript: 'bring the rental confirmation' }],
        },
        'rental confirmation',
      ),
    ).toBe(true);
  });

  it('returns false for empty query or non-matching content', () => {
    expect(
      messageMatchesChatSearchQuery(
        { text: 'hello', attachments: [{ transcript: 'world' }] },
        '   ',
      ),
    ).toBe(false);
    expect(
      messageMatchesChatSearchQuery(
        { text: 'Voice note', attachments: [{ transcript: 'bring snacks' }] },
        'airport',
      ),
    ).toBe(false);
  });
});
