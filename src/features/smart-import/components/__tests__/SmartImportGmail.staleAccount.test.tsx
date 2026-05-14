import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SmartImportGmail } from '../SmartImportGmail';

const mockNavigate = vi.fn();
const mockInvoke = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../api/gmailAuth', () => ({
  fetchGmailAccounts: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { fetchGmailAccounts } from '../../api/gmailAuth';

describe('SmartImportGmail stale account gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to first active account and blocks stale selections', async () => {
    vi.mocked(fetchGmailAccounts).mockResolvedValue([
      {
        id: 'stale-1',
        email: 'stale@example.com',
        created_at: '2026-01-01T00:00:00.000Z',
        is_active: true,
        token_expires_at: '2026-01-02T00:00:00.000Z',
        last_synced_at: null,
      },
      {
        id: 'active-1',
        email: 'active@example.com',
        created_at: '2026-01-01T00:00:00.000Z',
        is_active: true,
        token_expires_at: '2099-01-02T00:00:00.000Z',
        last_synced_at: null,
      },
    ]);

    mockInvoke.mockResolvedValue({ data: { candidates: [] }, error: null });

    render(<SmartImportGmail tripId="trip-1" />);

    await waitFor(() => {
      expect(screen.getByText(/smart import from gmail/i)).toBeVisible();
    });

    await userEvent.click(screen.getByRole('button', { name: /scan inbox/i }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('gmail-import-worker', {
        body: { tripId: 'trip-1', accountId: 'active-1' },
      });
    });

    expect(screen.queryByText(/selected account needs reconnect/i)).not.toBeInTheDocument();
  });
});
