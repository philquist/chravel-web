import { describe, expect, it } from 'vitest';
import { formatInAppAlertCopy } from '../notifications/alertCopy';

describe('formatInAppAlertCopy', () => {
  it('formats basecamp updates generically without address', () => {
    const copy = formatInAppAlertCopy({
      type: 'basecamp',
      title: 'Basecamp updated',
      message: '123 Main St, Austin TX',
      tripName: 'Austin Weekend',
    });

    expect(copy.title).toBe('Basecamp updated in Austin Weekend');
    expect(copy.description).toBe('The basecamp was updated in your Austin Weekend trip.');
    expect(copy.description).not.toContain('123 Main');
  });

  it('formats payment requests without amount or description', () => {
    const copy = formatInAppAlertCopy({
      type: 'payment',
      title: 'New payment request',
      message: 'Dinner · 84.50 USD',
      tripName: 'Tokyo Squad',
    });

    expect(copy.title).toBe('New payment request in Tokyo Squad');
    expect(copy.description).toBe('A new payment request was added to your Tokyo Squad trip.');
    expect(copy.description).not.toContain('84.50');
  });

  it('formats polls without the question text', () => {
    const copy = formatInAppAlertCopy({
      type: 'poll',
      title: 'New poll',
      message: 'Sushi or ramen tonight?',
      tripName: 'Japan Trip',
    });

    expect(copy.title).toBe('New poll in Japan Trip');
    expect(copy.description).toBe('A new poll was created in your Japan Trip trip.');
    expect(copy.description).not.toContain('Sushi');
  });

  it('formats join requests without requester name', () => {
    const copy = formatInAppAlertCopy({
      type: 'join_request',
      title: 'Emily wants to join Austin Weekend',
      message: 'Tap to approve or reject their request',
      tripName: 'Austin Weekend',
    });

    expect(copy.title).toBe('Join request in Austin Weekend');
    expect(copy.description).toBe('Someone requested to join your Austin Weekend trip.');
    expect(copy.description).not.toContain('Emily');
  });

  it('formats join approval notices generically', () => {
    const copy = formatInAppAlertCopy({
      type: 'success',
      title: '✅ Join Request Approved',
      message: 'Your request to join "Austin Weekend" has been approved!',
      tripName: 'Austin Weekend',
      metadata: { action: 'join_approved' },
    });

    expect(copy.title).toBe("You've been approved");
    expect(copy.description).toBe("You've been approved to join your Austin Weekend trip.");
  });

  it('passes chat snippets through unchanged', () => {
    const copy = formatInAppAlertCopy({
      type: 'chat',
      title: 'New message in Japan Trip',
      message: 'Meet at the lobby at 7',
      tripName: 'Japan Trip',
    });

    expect(copy.title).toBe('New message in Japan Trip');
    expect(copy.description).toBe('Meet at the lobby at 7');
  });

  it('falls back when trip name is missing', () => {
    const copy = formatInAppAlertCopy({
      type: 'broadcast',
      title: 'New broadcast',
      message: 'Wear black tonight',
      tripName: null,
    });

    expect(copy.title).toBe('New broadcast in your trip');
    expect(copy.description).toBe('A new broadcast was posted in your trip.');
  });
});
