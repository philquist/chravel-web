import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { DemoModeSelector } from '../DemoModeSelector';
import { HeaderAuthButton } from '../HeaderAuthButton';
import { Link } from 'react-router-dom';

interface NavSection {
  id: string;
  label: string;
}

const sections: NavSection[] = [
  { id: 'hero', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How It Works' },
  { id: 'ai', label: 'AI' },
  { id: 'use-cases', label: 'Use Cases' },
  { id: 'storage', label: 'Storage' },
  { id: 'proof', label: 'Reviews' },
  { id: 'replaces', label: 'Compare' },
  { id: 'faq', label: 'FAQ' },
  { id: 'pricing', label: 'Pricing' },
];

interface StickyLandingNavProps {
  onSignUp: () => void;
  /**
   * Scroll container for landing: pass the `overflow-y-auto` element so nav/progress work.
   * - `undefined`: listen on `window` (legacy / document scroll).
   * - `null`: container not mounted yet — skip until parent sets a node.
   */
  scrollRoot?: HTMLElement | null;
}

export const StickyLandingNav: React.FC<StickyLandingNavProps> = ({
  onSignUp: _onSignUp,
  scrollRoot,
}) => {
  const [activeSection, setActiveSection] = useState('hero');
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const user = null;
  const isSuperAdmin = false;

  useEffect(() => {
    if (scrollRoot === null) return;

    const root = scrollRoot;
    const useWindow = root === undefined;
    let rafId = 0;

    const computeScroll = () => {
      rafId = 0;
      const viewportH = useWindow ? window.innerHeight : root.clientHeight;
      const scrollTop = useWindow ? window.scrollY : root.scrollTop;
      const scrollableH = useWindow
        ? Math.max(0, document.documentElement.scrollHeight - viewportH)
        : Math.max(0, root.scrollHeight - root.clientHeight);

      setIsVisible(scrollTop > viewportH * 0.3);
      const progress = scrollableH > 0 ? (scrollTop / scrollableH) * 100 : 0;
      setScrollProgress(Math.min(Math.max(progress, 0), 100));
    };

    const handleScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(computeScroll);
    };

    const target: HTMLElement | Window = useWindow ? window : root;
    target.addEventListener('scroll', handleScroll, { passive: true });
    computeScroll();

    // Track active section via IntersectionObserver — replaces per-scroll
    // getBoundingClientRect() loop that forced layout every frame.
    const scope: ParentNode = useWindow ? document : root;
    const sectionEls = Array.from(
      scope.querySelectorAll<HTMLElement>('[id^="section-"]'),
    );
    const visibility = new Map<string, number>();
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          visibility.set(entry.target.id, entry.intersectionRatio);
        });
        let bestId = 'hero';
        let bestRatio = 0;
        visibility.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id.replace('section-', '');
          }
        });
        if (bestRatio > 0) setActiveSection(bestId);
      },
      {
        root: useWindow ? null : root,
        rootMargin: '-33% 0px -50% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    sectionEls.forEach(el => io.observe(el));

    return () => {
      target.removeEventListener('scroll', handleScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
      io.disconnect();
    };
  }, [scrollRoot]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(`section-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-transform duration-300 bg-background/80 backdrop-blur-lg border-b border-border/50',
        // Hide on mobile and tablet - only show on desktop (lg and up)
        'hidden lg:block',
        isVisible ? 'translate-y-0' : '-translate-y-full',
      )}
    >
      {/* Progress Bar */}
      <div
        className="absolute top-0 left-0 h-0.5 bg-primary transition-all duration-300"
        style={{ width: `${scrollProgress}%` }}
      />

      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="text-xl font-bold text-gradient-gold">
          ChravelApp
        </div>

        {/* For Teams Link (Desktop) */}
        <div className="hidden lg:flex items-center">
          <Link
            to="/teams"
            className="text-sm font-medium text-foreground hover:text-primary transition-colors px-4 py-2 rounded-md hover:bg-accent/10"
          >
            For Teams
          </Link>
        </div>

        {/* Section Dots (Desktop) */}
        <div className="hidden md:flex items-center gap-2">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={cn(
                'group relative h-2 rounded-full transition-all duration-300',
                activeSection === section.id
                  ? 'w-8 bg-primary'
                  : 'w-2 bg-muted hover:bg-muted-foreground',
              )}
              aria-label={`Go to ${section.label}`}
            >
              {/* Tooltip on hover */}
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs whitespace-nowrap bg-background/90 px-2 py-1 rounded pointer-events-none">
                {section.label}
              </span>
            </button>
          ))}
        </div>

        {/* Active Section Name (Desktop) */}
        <div className="hidden lg:block text-sm text-foreground font-medium min-w-[100px] text-center">
          {sections.find(s => s.id === activeSection)?.label || 'Home'}
        </div>

        {/* Right: Demo Selector + Log In for non-authenticated users */}
        <div className="flex items-center gap-2">
          {isSuperAdmin && <DemoModeSelector />}
          {!user && <HeaderAuthButton />}
        </div>
      </div>
    </nav>
  );
};
