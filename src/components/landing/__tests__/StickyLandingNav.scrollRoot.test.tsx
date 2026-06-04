import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/components/HeaderAuthButton', () => ({
  HeaderAuthButton: () => <span data-testid="mock-header-auth">Log in</span>,
}));

import { StickyLandingNav } from '../StickyLandingNav';

function LandingScrollHarness() {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  return (
    <BrowserRouter>
      <StickyLandingNav onSignUp={() => {}} scrollRoot={scrollRoot} />
      <div
        ref={setScrollRoot}
        data-testid="landing-scroll"
        style={{ height: 400, overflow: 'auto' }}
      >
        <section id="section-hero" style={{ height: 900 }}>
          hero
        </section>
        <section id="section-faq" style={{ height: 900 }}>
          faq
        </section>
      </div>
    </BrowserRouter>
  );
}

describe('StickyLandingNav scrollRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reacts to nested scroll container (not window)', () => {
    render(<LandingScrollHarness />);

    const root = screen.getByTestId('landing-scroll');
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 2000 });

    const nav = root.parentElement?.querySelector('nav');
    expect(nav).toBeTruthy();

    // Past 30% of viewport (400 * 0.3 = 120) should reveal sticky nav
    root.scrollTop = 200;
    fireEvent.scroll(root);

    expect(nav).toHaveClass('translate-y-0');
    expect(nav).not.toHaveClass('-translate-y-full');
  });

  it('coalesces a scroll burst within one frame and captures the final position on the trailing frame', () => {
    // Capture rAF callbacks instead of letting them run, so we can assert the
    // leading-edge (synchronous) update separately from the trailing recompute.
    const rafCbs: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      rafCbs.push(cb);
      return rafCbs.length;
    });

    try {
      render(<LandingScrollHarness />);

      const root = screen.getByTestId('landing-scroll');
      Object.defineProperty(root, 'clientHeight', { configurable: true, value: 400 });
      Object.defineProperty(root, 'scrollHeight', { configurable: true, value: 2000 });

      const nav = root.parentElement?.querySelector('nav') as HTMLElement;
      // First child of the nav is the progress bar whose width tracks scrollProgress.
      const progressBar = nav.querySelector('div') as HTMLElement;

      // scrollableH = scrollHeight - clientHeight = 2000 - 400 = 1600.
      // Leading edge: the first event of the frame updates synchronously.
      root.scrollTop = 200;
      fireEvent.scroll(root);
      expect(progressBar.style.width).toBe('12.5%'); // 200 / 1600

      // A second event arrives while the frame is still pending: it must NOT
      // recompute synchronously — the leading-edge value is held until the frame.
      root.scrollTop = 1600;
      fireEvent.scroll(root);
      expect(progressBar.style.width).toBe('12.5%');

      // Exactly one frame was scheduled (the leading edge); flushing it runs the
      // trailing recompute, which captures the latest scroll position.
      expect(rafCbs).toHaveLength(1);
      act(() => {
        rafCbs.forEach(cb => cb(0));
      });
      expect(progressBar.style.width).toBe('100%'); // 1600 / 1600
    } finally {
      rafSpy.mockRestore();
    }
  });
});
