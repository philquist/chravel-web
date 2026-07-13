import React, { type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useBodyPortalOverlayControls } from '@/hooks/useBodyPortalOverlayControls';

interface BodyPortalOverlayShellProps {
  /** When false, nothing is portaled. Defaults to true for mount-gated parents. */
  open?: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  panelClassName?: string;
  overlayTestId?: string;
  panelTestId?: string;
  /** Focused when the overlay becomes active. */
  inputRef?: RefObject<HTMLInputElement | null>;
  onDeactivate?: () => void;
}

/**
 * Body-portaled modal chrome for search/keyboard overlays inside trip shells.
 * Keeps z-index, backdrop dismiss guard, Escape, and input focus in one place.
 */
export function BodyPortalOverlayShell({
  open = true,
  onClose,
  ariaLabel,
  children,
  panelClassName,
  overlayTestId,
  panelTestId,
  inputRef,
  onDeactivate,
}: BodyPortalOverlayShellProps) {
  const { handleBackdropClose } = useBodyPortalOverlayControls({
    active: open,
    onClose,
    inputRef,
    onDeactivate,
  });

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 bg-black/80 backdrop-blur-md animate-fade-in"
      style={{
        paddingTop: 'max(5rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))',
      }}
      onClick={handleBackdropClose}
      data-testid={overlayTestId}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'w-full bg-background text-foreground rounded-2xl shadow-2xl border border-border overflow-hidden animate-scale-in',
          panelClassName,
        )}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        data-testid={panelTestId}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
