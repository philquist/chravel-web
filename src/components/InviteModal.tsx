import React, { useRef, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInviteLink } from '../hooks/useInviteLink';
import { InviteModalHeader } from './invite/InviteModalHeader';
import { InviteLinkSection } from './invite/InviteLinkSection';
import { InviteSettingsSection } from './invite/InviteSettingsSection';
import { InviteInstructions } from './invite/InviteInstructions';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from './ui/drawer';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripName: string;
  tripId?: string;
  proTripId?: string;
  tripType?: 'consumer' | 'pro' | 'event';
}

export type UsageLimitPreset = 'off' | '10' | '25' | '50' | 'custom';

/** Upper bound for custom usage limits — keeps leaked links bounded without blocking large events. */
export const MAX_CUSTOM_USAGE_LIMIT = 1000;

/**
 * Resolve the effective max_uses for an invite from the limit preset.
 * Returns null when the limit is off or the custom value is invalid (treated as unlimited).
 */
export function resolveMaxUses(preset: UsageLimitPreset, customValue: string): number | null {
  if (preset === 'off') return null;
  if (preset === 'custom') {
    const parsed = Number.parseInt(customValue.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1) return null;
    return Math.min(parsed, MAX_CUSTOM_USAGE_LIMIT);
  }
  return Number.parseInt(preset, 10);
}

export const InviteModal = ({ isOpen, onClose, tripName, tripId, proTripId }: InviteModalProps) => {
  const isMobile = useIsMobile();
  // All trip types require approval (enforced by the join-trip edge function).
  // Consumer trips: any member can approve. Pro/Event: creator/admins only.
  const [expireIn7Days, setExpireIn7Days] = React.useState(false);
  // Optional usage limit. Presets apply immediately; custom values are
  // committed on blur/Enter so each keystroke doesn't mint a new invite.
  const [usageLimitPreset, setUsageLimitPreset] = React.useState<UsageLimitPreset>('off');
  const [customUsageLimit, setCustomUsageLimit] = React.useState('');
  const [committedCustomUsageLimit, setCommittedCustomUsageLimit] = React.useState('');

  const maxUses = resolveMaxUses(usageLimitPreset, committedCustomUsageLimit);

  const initialActionRef = useRef<HTMLButtonElement>(null);

  const {
    copied,
    inviteLink,
    loading,
    isDemoMode,
    error,
    expiresAt,
    regenerateInviteToken,
    retryGenerate,
    handleCopyLink,
    handleShare,
  } = useInviteLink({
    isOpen,
    tripName,
    expireIn7Days,
    maxUses,
    tripId,
    proTripId,
  });

  const commitCustomUsageLimit = useCallback(() => {
    setCommittedCustomUsageLimit(customUsageLimit.trim());
  }, [customUsageLimit]);

  const handleDesktopOpenChange = useCallback((open: boolean) => !open && onClose(), [onClose]);

  if (!isOpen) return null;

  const usageLimitSection = (
    <div className="mb-3 space-y-2" role="group" aria-label="Invite usage limit">
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <label htmlFor="invite-usage-limit" className="text-gray-300 text-sm">
          Limit uses
        </label>
        <select
          id="invite-usage-limit"
          value={usageLimitPreset}
          onChange={e => setUsageLimitPreset(e.target.value as UsageLimitPreset)}
          aria-label="Limit how many people can use this invite link"
          className="min-h-[36px] rounded-md border border-border bg-background px-2 py-1.5 text-sm text-gray-200"
        >
          <option value="off">Off</option>
          <option value="10">10 uses</option>
          <option value="25">25 uses</option>
          <option value="50">50 uses</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      {usageLimitPreset === 'custom' && (
        <input
          id="invite-usage-limit-custom"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CUSTOM_USAGE_LIMIT}
          value={customUsageLimit}
          onChange={e => setCustomUsageLimit(e.target.value)}
          onBlur={commitCustomUsageLimit}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitCustomUsageLimit();
            }
          }}
          placeholder="Number of uses"
          aria-label="Custom number of uses for this invite link"
          className="w-full min-h-[36px] rounded-md border border-border bg-background px-2 py-1.5 text-sm text-gray-200 placeholder:text-gray-500"
        />
      )}
      <p className="text-xs text-gray-500">
        {maxUses !== null
          ? `Link stops working after ${maxUses} ${maxUses === 1 ? 'person joins' : 'people join'}.`
          : usageLimitPreset === 'custom'
            ? 'Enter how many people can use this link, then press Enter.'
            : 'Anyone with the link can use it until it expires or is turned off.'}
      </p>
    </div>
  );

  const modalContent = (
    <>
      <InviteModalHeader tripName={tripName} onClose={onClose} />

      <InviteLinkSection
        initialActionRef={initialActionRef}
        inviteLink={inviteLink}
        loading={loading}
        copied={copied}
        isDemoMode={isDemoMode}
        error={error}
        expiresAt={expiresAt}
        onCopyLink={handleCopyLink}
        onRegenerate={regenerateInviteToken}
        onRetry={retryGenerate}
        onShare={handleShare}
        tripName={tripName}
      />

      <InviteSettingsSection
        expireIn7Days={expireIn7Days}
        onExpireIn7DaysChange={setExpireIn7Days}
      />

      {usageLimitSection}

      <InviteInstructions />
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={open => !open && onClose()}>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Invite to {tripName}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 max-h-[80vh] overflow-y-auto">{modalContent}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleDesktopOpenChange}>
      <DialogContent
        showClose={false}
        aria-describedby={undefined}
        className="max-w-md border-border bg-background/95 p-0 outline-none"
        onOpenAutoFocus={event => {
          event.preventDefault();
          initialActionRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Invite to {tripName}</DialogTitle>
        <div className="max-h-[85vh] overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="space-y-5">
            <InviteModalHeader tripName={tripName} onClose={onClose} />
            <div className="border-t border-border/60" />
            <InviteLinkSection
              initialActionRef={initialActionRef}
              inviteLink={inviteLink}
              loading={loading}
              copied={copied}
              isDemoMode={isDemoMode}
              error={error}
              expiresAt={expiresAt}
              onCopyLink={handleCopyLink}
              onRegenerate={regenerateInviteToken}
              onRetry={retryGenerate}
              onShare={handleShare}
              tripName={tripName}
            />
            <div className="border-t border-border/60" />
            <InviteSettingsSection
              expireIn7Days={expireIn7Days}
              onExpireIn7DaysChange={setExpireIn7Days}
            />
            {usageLimitSection}
            <InviteInstructions />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
