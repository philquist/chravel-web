import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestNotificationButton } from '../TestNotificationButton';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

describe('TestNotificationButton', () => {
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const setAppBadge = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    toast.mockClear();
    showNotification.mockClear();
    setAppBadge.mockClear();

    // @ts-expect-error test shim for the Notification API
    global.Notification = { permission: 'granted', requestPermission: vi.fn() };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification }) },
    });
    (navigator as unknown as { setAppBadge: unknown }).setAppBadge = setAppBadge;
  });

  afterEach(() => {
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
  });

  it('shows a notification via the service worker and sets the app badge', async () => {
    render(<TestNotificationButton />);
    await userEvent.click(screen.getByRole('button', { name: /test notification/i }));

    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith('ChravelApp', expect.any(Object)),
    );
    expect(setAppBadge).toHaveBeenCalledWith(1);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test sent' }));
  });

  it('warns when notification permission is denied', async () => {
    // @ts-expect-error test shim
    global.Notification = { permission: 'denied', requestPermission: vi.fn() };
    render(<TestNotificationButton />);
    await userEvent.click(screen.getByRole('button', { name: /test notification/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Notifications blocked' }),
      ),
    );
    expect(showNotification).not.toHaveBeenCalled();
  });
});
