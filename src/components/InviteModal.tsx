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

export const InviteModal = ({
  isOpen,
  onClose,
  tripName,
  tripId,
  proTripId,
  tripType = 'consumer',
}: InviteModalProps) => {
  const isMobile = useIsMobile();
  // All trip types require approval (enforced on backend)
  // Consumer trips: any member can approve. Pro/Event: creator/admins only.
  // The share card / trip preview handles virality; the join boundary handles trust.
  const [requireApproval, setRequireApproval] = React.useState(true);
  const [expireIn7Days, setExpireIn7Days] = React.useState(false);

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
  } = useInviteLink({ isOpen, tripName, requireApproval, expireIn7Days, tripId, proTripId });

  const handleDesktopOpenChange = useCallback((open: boolean) => !open && onClose(), [onClose]);

  if (!isOpen) return null;

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
        requireApproval={requireApproval}
        expireIn7Days={expireIn7Days}
        onRequireApprovalChange={setRequireApproval}
        onExpireIn7DaysChange={setExpireIn7Days}
        tripType={tripType}
      />

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
              requireApproval={requireApproval}
              expireIn7Days={expireIn7Days}
              onRequireApprovalChange={setRequireApproval}
              onExpireIn7DaysChange={setExpireIn7Days}
              tripType={tripType}
            />
            <InviteInstructions />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
