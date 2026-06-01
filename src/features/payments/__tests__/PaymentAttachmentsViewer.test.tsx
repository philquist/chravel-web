import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentAttachmentsViewer } from '../components/PaymentAttachmentsViewer';
import type { PaymentAttachment } from '@/services/paymentAttachmentService';

// Keep the test light: stub URL resolution and the heavy lightbox modal.
vi.mock('@/hooks/useResolvedTripMediaUrl', () => ({
  useResolvedTripMediaUrl: ({ url }: { url: string | null }) => url,
}));
vi.mock('@/components/media/MediaViewerModal', () => ({
  MediaViewerModal: () => <div data-testid="media-viewer" />,
}));
vi.mock('@/services/tripMediaUrlResolver', () => ({
  resolveTripMediaUrl: vi.fn(async ({ mediaUrl }: { mediaUrl: string }) => mediaUrl),
}));

function makeAttachment(overrides: Partial<PaymentAttachment>): PaymentAttachment {
  return {
    id: 'a1',
    paymentMessageId: 'p1',
    tripId: 't1',
    attachmentType: 'link',
    fileName: null,
    mimeType: null,
    fileSize: null,
    storagePath: null,
    url: 'https://example.com/order',
    title: 'Order confirmation',
    metadata: { domain: 'example.com' },
    createdAt: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('PaymentAttachmentsViewer', () => {
  it('renders nothing when there are no attachments', () => {
    const { container } = render(<PaymentAttachmentsViewer attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a singular affordance for one attachment', () => {
    render(<PaymentAttachmentsViewer attachments={[makeAttachment({})]} />);
    expect(screen.getByText('View attachment')).toBeInTheDocument();
  });

  it('shows a count for multiple attachments and expands the list on click', async () => {
    const user = userEvent.setup();
    const attachments = [
      makeAttachment({ id: 'a1', title: 'Order confirmation' }),
      makeAttachment({
        id: 'a2',
        attachmentType: 'file',
        title: 'receipt.pdf',
        fileName: 'receipt.pdf',
        url: 'https://x/storage/v1/object/public/trip-media/t1/files/r.pdf',
      }),
    ];
    render(<PaymentAttachmentsViewer attachments={attachments} />);

    const trigger = screen.getByText('2 attachments');
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByText('Order confirmation')).toBeInTheDocument();
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument();
  });
});
