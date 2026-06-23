## Problem

In Profile Settings, "Delete Account" currently calls `navigate('/settings', { state: { section: 'settings' } })`, which dumps the user on General Settings and forces them to scroll to Account Management before the delete confirmation modal appears.

## Goal

Clicking **Delete Account** in Profile Settings opens the existing "Delete Your Account?" confirmation modal in place — no navigation, no scroll.

## Approach

Extract the existing delete-account confirmation dialog (currently inline in `src/components/consumer/ConsumerGeneralSettings.tsx`, lines ~318–400) into a small reusable component, then render it from both places.

### 1. New component: `src/components/consumer/DeleteAccountDialog.tsx`
- Props: `open: boolean`, `onOpenChange: (open: boolean) => void`.
- Owns: `confirmText`, `isDeleting`, `handleDeleteAccount` (uses existing `deleteAccountImmediately` from `@/lib/accountDeletion`), toast/sign-out + cache-purge behavior, all copy and inputs exactly as they exist today.
- No behavior change vs. current dialog — pure lift-and-shift.

### 2. `ConsumerGeneralSettings.tsx`
- Replace the inline `AlertDialog` block (and its local `confirmText` / `isDeleting` / `handleDeleteAccount` state) with `<DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />`.
- Keep the existing "Delete Account" row that sets `showDeleteDialog = true`.

### 3. `ConsumerProfileSection.tsx`
- Add local `const [showDeleteDialog, setShowDeleteDialog] = useState(false)`.
- Change the Delete Account button's `onClick` from the `navigate(...)` call to `setShowDeleteDialog(true)`.
- Render `<DeleteAccountDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />` at the bottom of the component.

### What is NOT changing
- Sign Out button behavior.
- The delete flow itself (typed confirmation, password-by-session deletion, post-delete sign-out + redirect).
- General Settings page still has its own Account Management row as a secondary entry point.
- `DeleteAccountPage.tsx` (separate public/Play Store compliance page) is untouched.

## Files touched
- **New**: `src/components/consumer/DeleteAccountDialog.tsx`
- **Edit**: `src/components/consumer/ConsumerGeneralSettings.tsx` — replace inline dialog with new component
- **Edit**: `src/components/consumer/ConsumerProfileSection.tsx` — trigger dialog instead of navigating

## Verification
- Profile Settings → tap **Delete Account** → modal opens immediately, no route change, no scroll.
- General Settings → Account Management → **Delete Account** → same modal opens (regression check).
- Type "delete" + confirm → existing deletion + sign-out path runs unchanged.
- Cancel closes the modal cleanly in both entry points.
