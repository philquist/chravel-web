import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logAuthEvent } from '@/utils/authTelemetry';
import { userHasEmailPasswordIdentity } from '@/utils/authProviders';
import { deleteAccountImmediately } from '@/lib/accountDeletion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shared account-deletion confirmation dialog.
 * Lifted from ConsumerGeneralSettings so it can be triggered directly
 * from Profile Settings without forcing a route change + scroll.
 */
export const DeleteAccountDialog: React.FC<DeleteAccountDialogProps> = ({ open, onOpenChange }) => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [reAuthError, setReAuthError] = useState('');
  const requiresPasswordReauth = useMemo(() => userHasEmailPasswordIdentity(session), [session]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) {
        setConfirmText('');
        setReAuthPassword('');
        setReAuthError('');
      }
    },
    [onOpenChange],
  );

  const handleDeleteAccount = useCallback(async () => {
    if (confirmText.trim().toLowerCase() !== 'delete') return;
    if (requiresPasswordReauth && !reAuthPassword) return;

    const finalConfirmed = window.confirm(
      'FINAL CONFIRMATION\n\n' +
        'This will IMMEDIATELY and PERMANENTLY delete your ChravelApp account and all ' +
        'associated data — profile, trips you own, messages, uploaded media, payment ' +
        'history, AI Concierge history, notifications, and preferences.\n\n' +
        'There is NO 30-day grace period. There is NO way to recover this account or ' +
        'its data after you click OK.\n\n' +
        'Click OK to delete your account right now, or Cancel to keep your account.',
    );
    if (!finalConfirmed) return;

    setIsDeleting(true);
    setReAuthError('');
    try {
      if (requiresPasswordReauth && user?.email) {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: reAuthPassword,
        });
        if (authErr) {
          setReAuthError('Incorrect password. Please try again.');
          setIsDeleting(false);
          return;
        }
      }

      const result = await deleteAccountImmediately();
      if (result.success === false) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }

      logAuthEvent('account_deletion_requested');
      onOpenChange(false);
      setConfirmText('');
      setReAuthPassword('');

      toast({
        title: 'Account deleted',
        description: result.message,
      });

      await supabase.auth.signOut().catch(() => undefined);
      navigate('/', { replace: true });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete your account. Please contact privacy@chravelapp.com',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [confirmText, navigate, onOpenChange, reAuthPassword, requiresPasswordReauth, user?.email]);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="bg-gray-900 border border-red-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-400">Delete Your Account?</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-300 space-y-3">
            <p>
              This action is <strong>immediate and cannot be undone</strong>. The following will be
              permanently removed:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Your profile and personal information</li>
              <li>All trips you've created</li>
              <li>Your messages and media uploads</li>
              <li>Your subscription and payment history</li>
            </ul>
            <p className="text-sm text-gray-400">
              You will be signed out as soon as deletion completes.
            </p>
            <p className="pt-2">
              To confirm, type <strong>delete</strong> below. Your account will be removed
              immediately — there is no waiting period.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Type delete to confirm"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
              disabled={isDeleting}
            />
            {requiresPasswordReauth ? (
              <>
                <p className="pt-2">Enter your password to verify your identity:</p>
                <input
                  type="password"
                  value={reAuthPassword}
                  onChange={e => {
                    setReAuthPassword(e.target.value);
                    setReAuthError('');
                  }}
                  placeholder="Enter your password"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  disabled={isDeleting}
                />
                {reAuthError && <p className="text-red-400 text-sm">{reAuthError}</p>}
              </>
            ) : (
              <p className="pt-2 text-sm text-gray-400">
                You signed in with Google or Apple, so no password is required. Confirming below
                will delete your account using your active session.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDeleting}
            className="bg-gray-700 text-white hover:bg-gray-600"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteAccount}
            disabled={
              confirmText.trim().toLowerCase() !== 'delete' ||
              (requiresPasswordReauth && !reAuthPassword) ||
              isDeleting
            }
            className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Account Permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
