## Two issues, both real

**1. Unreadable text in the modal.** `src/index.css` ships a global `.light` theme override that remaps `text-white`, `text-gray-300`, `text-gray-400`, etc. to dark "ink" tokens (lines 469–509). The marketing page boots in light mode, so when the AuthModal portal renders, every `text-white` (header, Google/Apple labels, submit button) and `text-gray-300` (First Name / Last Name / Email / Password labels) gets rewritten to dark ink on the modal's dark `bg-slate-950/90` surface — exactly what's in the screenshot. The same CSS already provides an opt-out: any element wrapped in `.dark-section` keeps its dark-mode colors (lines 722–741).

**2. Modal opens over a blank white screen.** `/` is served by `MarketingApp` (no `AuthProvider`), so `HeaderAuthButton` falls through to `window.location.assign('/auth?mode=signin')`. That navigates away from the marketing page to `AuthPage`, which renders the modal on top of an empty `<div className="min-h-screen bg-background">`. In light mode that background is white — what you're seeing.

## Fix

**A. Restore contrast (one line in AuthModal)**

`src/components/AuthModal.tsx` — add `dark-section` to the portal root so the global `.light` override stops dimming the modal's text. No per-label color edits needed; the existing `text-white` / `text-gray-300` classes will then render correctly bright against the dark slate surface, fixing the title, the First/Last Name / Email / Password labels, and the Google/Apple button labels in one shot.

```tsx
<div
  data-testid="auth-modal-backdrop"
  className="dark-section fixed inset-0 z-[100] flex flex-col animate-fade-in"
>
```

**B. Open the modal over the marketing page (not over a blank route)**

1. `src/MarketingApp.tsx` — wrap `<FullPageLanding>` in `<AuthProvider>` so `HeaderAuthButton` sees a real auth context on `/` and uses its in-place `<AuthModal>` branch instead of the `window.location.assign('/auth?mode=signin')` fallback. Also route the hero "Sign Up" CTA through the same in-place modal (initialMode `signup`) instead of navigating to `/auth?mode=signup`.

   Sketch:
   ```tsx
   import { AuthProvider } from '@/hooks/useAuth';
   import { AuthModal } from '@/components/AuthModal';

   export default function MarketingApp() {
     const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
     // ...
     return (
       <BrowserRouter>
         <AuthProvider>
           <Suspense fallback={fallback}>
             <FullPageLanding onSignUp={() => setAuthMode('signup')} />
             {authMode && (
               <AuthModal
                 isOpen
                 initialMode={authMode}
                 onClose={() => setAuthMode(null)}
               />
             )}
           </Suspense>
         </AuthProvider>
       </BrowserRouter>
     );
   }
   ```

2. `src/components/HeaderAuthButton.tsx` — drop the `window.location.assign('/auth?mode=signin')` fallback now that the marketing shell provides `AuthProvider`; always open the in-place modal. Also remove the `auth &&` guard around `<AuthModal>` so it can mount immediately on click.

`AuthPage` (`/auth`) stays in place — it remains the OAuth-redirect landing target and a deep-link entry point — and inherits the same contrast fix automatically via change A.

## Out of scope (intentionally deferred)

- Auditing every other `text-white` / `text-gray-300` usage app-wide for light-mode contrast. Only fixing the surface the user reported; the `dark-section` opt-out is the documented escape hatch and is the smallest correct change.
- Any redesign of the modal layout, copy, or OAuth providers.

## Validation

- Hard-reload `/`, click "Log In" → modal opens overlaid on the marketing page (no white screen, no route change), title + labels + Google/Apple text are bright white on the dark slate panel.
- Click "Sign Up" hero CTA → same modal opens with Sign Up tab pre-selected.
- Visit `/auth?mode=signin` directly → modal still renders, now with correct contrast.
- Visit `/auth?mode=signin` while signed in → existing redirect behavior preserved.
