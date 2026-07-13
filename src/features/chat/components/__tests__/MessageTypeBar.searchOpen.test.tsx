import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageTypeBar } from '../MessageTypeBar';

describe('MessageTypeBar search open gesture', () => {
  it('opens search from a trusted touch pointerdown (mobile WebView parity)', () => {
    const onSearchClick = vi.fn();

    render(
      <MessageTypeBar activeFilter="all" onFilterChange={vi.fn()} onSearchClick={onSearchClick} />,
    );

    const searchBtn = screen.getByTestId('chat-search-btn');
    fireEvent.pointerDown(searchBtn, { pointerType: 'touch' });
    expect(onSearchClick).toHaveBeenCalledTimes(1);

    fireEvent.click(searchBtn);
    expect(onSearchClick).toHaveBeenCalledTimes(2);
  });

  it('does not open search from mouse pointerdown (click owns desktop)', () => {
    const onSearchClick = vi.fn();

    render(
      <MessageTypeBar activeFilter="all" onFilterChange={vi.fn()} onSearchClick={onSearchClick} />,
    );

    const searchBtn = screen.getByTestId('chat-search-btn');
    fireEvent.pointerDown(searchBtn, { pointerType: 'mouse' });
    expect(onSearchClick).not.toHaveBeenCalled();

    fireEvent.click(searchBtn);
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });
});
