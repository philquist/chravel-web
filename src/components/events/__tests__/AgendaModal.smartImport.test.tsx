import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { AgendaModal } from '../AgendaModal';

const mockUseConsumerSubscription = vi.fn();

vi.mock('@/hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, isLoading: false }),
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => mockUseConsumerSubscription(),
}));

// useDeferredPaidAccess defers the paid check until browser idle / first interaction, so in a
// synchronous render it returns false. Bypass the deferral here and exercise the real paid-access
// gate directly, which is what these tests actually assert (button enabled/disabled by tier).
vi.mock('@/hooks/useDeferredPaidAccess', async () => {
  const { hasPaidAccess } = await import('@/utils/paidAccess');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { useDeferredPaidAccess: (input: any) => hasPaidAccess(input) };
});

vi.mock('@/hooks/useEventAgenda', () => ({
  useEventAgenda: () => ({
    sessions: [],
    addSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    bulkAddSessions: vi.fn().mockResolvedValue({ imported: 0, failed: 0 }),
    isAdding: false,
    isUpdating: false,
  }),
}));

vi.mock('@/hooks/useEventAgendaFiles', () => ({
  useEventAgendaFiles: () => ({
    files: [],
    isLoading: false,
    isUploading: false,
    uploadError: null,
    loadError: null,
    clearError: vi.fn(),
    uploadFiles: vi.fn(),
    deleteFile: vi.fn(),
    maxFiles: 5,
    remainingSlots: 5,
    canUpload: true,
    formatFileSize: (bytes: number) =>
      bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`,
  }),
}));

vi.mock('@/features/calendar/hooks/useBackgroundAgendaImport', () => ({
  useBackgroundAgendaImport: () => ({
    pendingResult: null,
    startImport: vi.fn(),
    clearResult: vi.fn(),
  }),
}));

vi.mock('../AgendaImportModal', () => ({
  AgendaImportModal: () => null,
}));

const defaultPermissions = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canUpload: true,
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('AgendaModal Import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows enabled Import Agenda button when user has paid access', () => {
    mockUseConsumerSubscription.mockReturnValue({
      tier: 'explorer',
      subscription: { status: 'active' },
      isSuperAdmin: false,
    });

    render(<AgendaModal eventId="evt-1" permissions={defaultPermissions} />, {
      wrapper: createWrapper(),
    });

    const importButton = screen.getByRole('button', { name: /Import/i });
    expect(importButton).toBeInTheDocument();
    expect(importButton).not.toBeDisabled();
  });

  it('shows disabled Import Agenda button when user lacks paid access', () => {
    mockUseConsumerSubscription.mockReturnValue({
      tier: 'free',
      subscription: { status: 'inactive' },
      isSuperAdmin: false,
    });

    render(<AgendaModal eventId="evt-1" permissions={defaultPermissions} />, {
      wrapper: createWrapper(),
    });

    const importButton = screen.getByRole('button', { name: /Import/i });
    expect(importButton).toBeInTheDocument();
    expect(importButton).toBeDisabled();
  });
});
