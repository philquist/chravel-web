import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocationSearchBar } from '../home/LocationSearchBar';

vi.mock('@/services/googlePlacesNew', () => ({
  autocomplete: vi.fn(),
  generateSessionToken: vi.fn(() => 'session-test'),
}));

vi.mock('@/lib/webPermissions', () => ({
  getPermissionStatus: vi.fn(),
}));

vi.mock('../../contexts/BasecampContext', () => ({
  useBasecamp: () => ({ basecamp: null }),
}));

const { autocomplete } = await import('@/services/googlePlacesNew');
const { getPermissionStatus } = await import('@/lib/webPermissions');

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('LocationSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPermissionStatus).mockResolvedValue({
      id: 'location',
      state: 'denied',
      canRequest: false,
      canOpenSettings: true,
    });
  });

  it('debounces rapid search switching and only queries latest term', async () => {
    vi.mocked(autocomplete).mockResolvedValue([{ place_id: '1', description: 'Paris, France' }]);
    renderWithQuery(<LocationSearchBar onLocationSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search city or location...');
    fireEvent.change(input, { target: { value: 'pa' } });
    fireEvent.change(input, { target: { value: 'pari' } });
    fireEvent.change(input, { target: { value: 'paris' } });

    await waitFor(() => {
      expect(autocomplete).toHaveBeenCalledTimes(1);
      expect(autocomplete).toHaveBeenCalledWith('paris', 'session-test', undefined);
    });
  });

  it('handles offline autocomplete failures without crashing', async () => {
    vi.mocked(autocomplete).mockRejectedValue(new Error('offline'));
    renderWithQuery(<LocationSearchBar onLocationSelect={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search city or location...');
    fireEvent.change(input, { target: { value: 'ny' } });

    await waitFor(() => {
      expect(autocomplete).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Paris, France')).not.toBeInTheDocument();
  });
});
