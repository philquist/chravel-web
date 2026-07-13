import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalendarImportModal } from '@/features/calendar/components/CalendarImportModal';
import type { SmartParseResult } from '@/utils/calendarImportParsers';

vi.mock('@/hooks/useSmartImportDropzone', () => ({
  useSmartImportDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    getCameraInputProps: () => ({
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      className: 'sr-only',
      onChange: vi.fn(),
    }),
    isDragActive: false,
  }),
}));

vi.mock('@/hooks/useModalFileDropGuard', () => ({
  useModalFileDropGuard: () => ({ onDragOverCapture: vi.fn(), onDropCapture: vi.fn() }),
}));

vi.mock('@/hooks/useConsumerSubscription', () => ({
  useConsumerSubscription: () => ({
    tier: 'free',
    subscription: null,
    isSuperAdmin: false,
  }),
}));

vi.mock('@/hooks/useDeferredPaidAccess', () => ({
  useDeferredPaidAccess: () => false,
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: () => false,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@/services/calendarService', () => ({
  calendarService: {
    bulkCreateEvents: vi.fn(async () => ({ imported: 2, failed: 0, events: [] })),
  },
}));

vi.mock('@/features/calendar/utils/calendarImportBatch', () => ({
  createCalendarImportBatch: vi.fn(async () => ({
    id: 'batch-1',
    trip_id: 'trip-1',
    created_by: 'user-1',
    source_format: 'csv',
    status: 'committing',
    events_imported: 0,
    events_skipped: 0,
    events_failed: 0,
  })),
  finalizeCalendarImportBatch: vi.fn(async () => undefined),
  undoCalendarImportBatch: vi.fn(async () => ({
    batch_id: 'batch-1',
    status: 'reverted',
    reverted: 2,
    conflicted: 0,
    already_gone: 0,
    repeat_safe: true,
  })),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  }),
}));

function makePendingResult(overrides?: Partial<SmartParseResult>): SmartParseResult {
  return {
    isValid: true,
    errors: [],
    sourceFormat: 'csv',
    events: [
      {
        uid: 'e1',
        title: 'Pacers vs Celtics',
        startTime: new Date('2026-02-10T19:00:00Z'),
        endTime: new Date('2026-02-10T21:00:00Z'),
        location: 'Gainbridge',
        isAllDay: false,
      },
      {
        uid: 'e2',
        title: 'Pacers @ Heat',
        startTime: new Date('2026-02-12T19:00:00Z'),
        endTime: new Date('2026-02-12T21:00:00Z'),
        location: 'Miami',
        isAllDay: false,
      },
      {
        uid: 'e3',
        title: 'Pacers vs Bucks',
        startTime: new Date('2026-02-14T19:00:00Z'),
        endTime: new Date('2026-02-14T21:00:00Z'),
        location: 'Gainbridge',
        isAllDay: false,
      },
      {
        uid: 'e4',
        title: 'Pacers @ Knicks',
        startTime: new Date('2026-02-16T19:00:00Z'),
        endTime: new Date('2026-02-16T21:00:00Z'),
        location: 'MSG',
        isAllDay: false,
      },
      {
        uid: 'e5',
        title: 'Pacers vs Nets',
        startTime: new Date('2026-02-18T19:00:00Z'),
        endTime: new Date('2026-02-18T21:00:00Z'),
        location: 'Gainbridge',
        isAllDay: false,
      },
    ],
    ...overrides,
  };
}

describe('CalendarImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stacks URL controls and uses mobile-first copy in idle state', () => {
    render(<CalendarImportModal isOpen onClose={vi.fn()} tripId="trip-1" existingEvents={[]} />);

    expect(screen.getByText(/Tap to choose a file/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Schedule URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take Photo of Schedule/i })).toBeInTheDocument();
  });

  it('opens pending results in preview with home/away filters and selection', async () => {
    render(
      <CalendarImportModal
        isOpen
        onClose={vi.fn()}
        tripId="trip-1"
        existingEvents={[]}
        pendingResult={makePendingResult()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/selected/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Away/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Home/i }));
    expect(screen.getByRole('button', { name: /Import \d+ Event/i })).toBeEnabled();
  });

  it('commits selected events through a durable import batch', async () => {
    const { calendarService } = await import('@/services/calendarService');
    const { createCalendarImportBatch } =
      await import('@/features/calendar/utils/calendarImportBatch');

    render(
      <CalendarImportModal
        isOpen
        onClose={vi.fn()}
        tripId="trip-1"
        existingEvents={[]}
        pendingResult={makePendingResult()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import \d+ Event/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Import \d+ Event/i }));

    await waitFor(() => {
      expect(createCalendarImportBatch).toHaveBeenCalled();
      expect(calendarService.bulkCreateEvents).toHaveBeenCalled();
    });

    const bulkArgs = vi.mocked(calendarService.bulkCreateEvents).mock.calls[0][0];
    expect(bulkArgs.every(e => e.import_batch_id === 'batch-1')).toBe(true);
    expect(bulkArgs.every(e => e.source_type === 'bulk_import')).toBe(true);
  });
});
