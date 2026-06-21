import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const NAV_LINKS: { label: string; to: string }[] = [
  { label: 'Home', to: '/' },
  { label: 'Use Cases', to: '/use-cases' },
  { label: 'Blog', to: '/blog' },
  { label: 'For Teams', to: '/teams' },
];

interface MobileLandingNavProps {
  onSignUp: () => void;
}

/**
 * Mobile/tablet landing navigation. The desktop StickyLandingNav is `hidden lg:block`,
 * so smaller screens had no nav to reach the marketing pages (Use Cases, Blog, For Teams) —
 * only the footer. This adds a hamburger → Sheet menu for those screens only (`lg:hidden`).
 */
export const MobileLandingNav = ({ onSignUp }: MobileLandingNavProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="lg:hidden fixed top-0 right-0 z-50"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="m-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border/50 bg-background/40 text-foreground backdrop-blur-md transition-colors hover:bg-background/60"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="text-gradient-gold text-xl">ChravelApp</SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            {NAV_LINKS.map(link => (
              <SheetClose asChild key={link.to}>
                <Link
                  to={link.to}
                  className="rounded-lg px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-accent/10 hover:text-primary"
                >
                  {link.label}
                </Link>
              </SheetClose>
            ))}
          </nav>
          <div className="mt-6 border-t border-border/50 pt-6">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignUp();
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
