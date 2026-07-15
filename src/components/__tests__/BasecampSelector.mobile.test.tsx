import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('BasecampSelector mobile layout', () => {
  it('uses a scrollable safe-area overlay so the modal header is not cropped on short screens', async () => {
    const { BasecampSelector } = await import('../BasecampSelector');

    render(<BasecampSelector isOpen onClose={vi.fn()} onBasecampSet={vi.fn()} isPersonal />);

    const dialogTitle = screen.getByRole('heading', { name: 'Set Basecamp' });
    const overlay = dialogTitle.closest('.fixed');
    const panel = dialogTitle.closest('.rounded-3xl');
    const header = dialogTitle.closest('.sticky');

    expect(overlay).toHaveClass('items-start', 'overflow-y-auto');
    expect(panel).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-y-auto');
    expect(header).toHaveClass('sticky', 'top-0');
  });
});
