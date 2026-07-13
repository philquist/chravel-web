import React, { type MouseEventHandler, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from '../MessageBubble';

const mockedPickerEmoji = '🎯';

vi.mock('@/hooks/useLongPress', () => ({
  useLongPress: ({ onLongPress }: { onLongPress: () => void }) => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    onMouseDown: () => onLongPress(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    onMouseLeave: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMobilePortrait', () => ({
  useMobilePortrait: () => false,
}));

vi.mock('@/hooks/useResolvedTripMediaUrl', () => ({
  useResolvedTripMediaUrl: () => null,
}));

vi.mock('@/lib/featureFlags', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('../MessageActions', () => ({
  MessageActions: () => null,
}));

vi.mock('../GoogleMapsWidget', () => ({
  GoogleMapsWidget: () => null,
}));

vi.mock('../GroundingCitationCard', () => ({
  GroundingCitationCard: () => null,
}));

vi.mock('../ImageLightbox', () => ({
  ImageLightbox: () => null,
}));

vi.mock('../ReadReceipts', () => ({
  ReadReceipts: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../EmojiMartPicker', () => ({
  EmojiMartPicker: ({ onEmojiSelect }: { onEmojiSelect: (emoji: { native?: string }) => void }) => (
    <button onClick={() => onEmojiSelect({ native: mockedPickerEmoji })}>pick custom emoji</button>
  ),
}));

vi.mock('@/components/ui/popover', () => {
  const PopoverContext = React.createContext<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
  } | null>(null);

  return {
    Popover: ({
      children,
      open = false,
      onOpenChange = () => undefined,
    }: {
      children: ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <PopoverContext.Provider value={{ open, onOpenChange }}>{children}</PopoverContext.Provider>
    ),
    PopoverTrigger: ({ children }: { children: ReactNode }) => {
      const context = React.useContext(PopoverContext);

      if (!context || !React.isValidElement(children)) {
        return <>{children}</>;
      }

      const existingOnClick = (children.props as { onClick?: MouseEventHandler }).onClick;

      return React.cloneElement(children as ReactElement, {
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          existingOnClick?.(event);
          context.onOpenChange(!context.open);
        },
      });
    },
    PopoverContent: ({
      children,
      onOpenAutoFocus: _onOpenAutoFocus,
      ...props
    }: {
      children: ReactNode;
      onOpenAutoFocus?: (event: Event) => void;
    } & React.HTMLAttributes<HTMLDivElement>) => {
      const context = React.useContext(PopoverContext);

      if (!context?.open) {
        return null;
      }

      return <div {...props}>{children}</div>;
    },
  };
});

describe('MessageBubble reaction picker', () => {
  it('keeps the reaction tray open long enough to use the plus-button emoji picker', async () => {
    const user = userEvent.setup();
    const onReaction = vi.fn();

    render(
      <MessageBubble
        id="message-1"
        text="Need a reaction"
        senderName="Alex"
        timestamp="2026-04-25T15:00:00.000Z"
        onReaction={onReaction}
        currentUserId="user-1"
        showSenderInfo={false}
      />,
    );

    await act(async () => {
      fireEvent.mouseDown(screen.getByText('Need a reaction'));
    });

    const pickerTrigger = screen.getByLabelText('Open full emoji picker');
    expect(pickerTrigger).toBeInTheDocument();

    await act(async () => {
      await user.click(pickerTrigger);
    });

    expect(screen.getByText('pick custom emoji')).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByText('pick custom emoji'));
    });

    expect(onReaction).toHaveBeenCalledWith('message-1', mockedPickerEmoji);

    await waitFor(() => {
      expect(screen.queryByLabelText('Open full emoji picker')).not.toBeInTheDocument();
      expect(screen.queryByText('pick custom emoji')).not.toBeInTheDocument();
    });
  });
});
