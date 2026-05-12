## Change

In `src/components/AuthModal.tsx` (lines 344–355), replace the `<img src="/chravel-logo.png" />` block with a gold gradient text wordmark matching the landing footer's treatment.

## Replacement

```tsx
<div className="flex flex-col items-center mb-5">
  <span
    className="text-3xl font-bold text-gradient-gold select-none"
    data-testid="auth-modal-logo"
  >
    ChravelApp
  </span>
</div>
```

This reuses the existing `text-gradient-gold` utility (already used in `FooterSection.tsx`) so the modal matches the rest of the site's premium gold gradient and removes the small globe favicon entirely.

## Scope

- One file edited: `src/components/AuthModal.tsx`
- No new assets, no logic changes, no auth behavior changes
- `data-testid="auth-modal-logo"` preserved so existing tests still pass
