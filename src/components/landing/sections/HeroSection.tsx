import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';

// Real-product-walkthrough video built from fresh demo-mode UI captures.
// Source: remotion/src/compositions/HomepageProductDemo60.tsx
// Regenerate: see public/videos/README.md (capture → render → poster).
// Served from public/ so the file ships with every deploy — no external
// asset store involved (a previous sandbox-only asset URL broke in prod).

const HERO_VIDEO_SRC = '/videos/chravel-homepage-demo-60.mp4';
const HERO_VIDEO_POSTER = '/videos/chravel-homepage-demo-60-poster.jpg';

/** The proof strip under the demo — the six P's, rendered as an editorial index. */
const HERO_PROOF_ITEMS = ['Plans', 'Photos', 'Places', 'Polls', 'PDFs', 'Payments'];

interface HeroSectionProps {
  onSignUp: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onSignUp }) => {
  const [videoFailed, setVideoFailed] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Hero demo is muted + decorative — always autoplay regardless of
  // prefers-reduced-motion. Fallback to poster only on real load error.
  const showVideo = !videoFailed;

  // Explicitly invoke play() so we can observe autoplay-policy rejections
  // (the <video autoplay> attribute swallows them silently). Desktop Chrome
  // and the Lovable preview iframe (no allow="autoplay") commonly block
  // muted autoplay; mobile Safari/Chrome are more permissive.
  const attemptPlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    }
  }, []);

  // Trigger first play attempt when the hero is actually visible (handles
  // tab-switch and slow first-paint where the autoplay heuristic already
  // decided). Fall back to immediate attempt if IO is unavailable.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || videoFailed) return;
    if (typeof IntersectionObserver === 'undefined') {
      attemptPlay();
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) attemptPlay();
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [attemptPlay, videoFailed]);

  const handleManualPlay = () => {
    setAutoplayBlocked(false);
    attemptPlay();
  };

  const scrollToHowItWorks = () => {
    document
      .getElementById('section-features')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className="relative container mx-auto px-4 flex flex-col min-h-[85vh] tablet:min-h-[90vh] text-center pb-8 tablet:pb-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      }}
    >
      {/* Top-right Sign up / Log in button - DESKTOP ONLY (≥1024px)
          IMPORTANT: Must use lg: breakpoint (1024px) to match useIsMobile() hook.
          DO NOT change to md: as it causes button overlap on mobile/PWA (768-1023px devices) */}
      <div
        className="absolute right-2 w-auto z-10 hidden lg:block"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        }}
      >
        <Button
          size="sm"
          onClick={onSignUp}
          className="text-xs px-3 py-1 accent-fill-gold backdrop-blur-md font-semibold h-7"
        >
          Get Started
        </Button>
      </div>

      {/* Top Section: Brand + Headline + Subtitle */}
      <div className="flex-shrink-0 pt-4 tablet:pt-8">
        {/* Eyebrow chip — gold rule + label, premium signal */}
        <div
          className="flex items-center justify-center gap-3 mb-3 tablet:mb-4 animate-fade-in"
          style={{ animationDelay: '0.02s' }}
          aria-hidden="true"
        >
          <span className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-[#c49746]" />
          <span
            className="text-[10px] sm:text-xs font-semibold tracking-[0.32em] uppercase text-[#feeaa5]"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
          >
            Less Chaos · More Coordination
          </span>
          <span className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-[#c49746]" />
        </div>

        {/* Brand Name (styled div — not a heading, to preserve h1→h2→h3 order) */}
        <div
          className="inline-block animate-fade-in mb-2 tablet:mb-3"
          style={{ animationDelay: '0.05s' }}
        >
          <div
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-[0.02em] text-gradient-gold"
            aria-hidden="true"
          >
            ChravelApp
          </div>
        </div>

        {/* Descriptor tagline — reveals how Chat + Travel + App combine into ChravelApp.
            Gold letters (CH, RAVEL, APP) spell the wordmark; italics via Fraunces. */}
        <div className="w-full flex items-center justify-center px-2 tablet:px-4 mb-3 tablet:mb-4">
          <h1
            className="text-3xl sm:text-4xl md:text-[2.75rem] lg:text-5xl font-bold text-white leading-[1.04] tracking-tight animate-fade-in text-center w-full"
            style={{
              textShadow:
                '0 2px 8px rgba(0,0,0,0.6), 0 4px 18px rgba(0,0,0,0.45), 0 0 44px rgba(196,151,70,0.28)',
            }}
            aria-label="The Group Chat Travel App"
          >
            <span aria-hidden="true">
              The&nbsp;Group&nbsp;
              <span className="whitespace-nowrap">
                <em className="text-gradient-gold">Ch</em>
                at&nbsp;
                <em>
                  T<span className="text-gradient-gold">ravel</span>
                </em>{' '}
                <em className="text-gradient-gold">App</em>
              </span>
            </span>
          </h1>
        </div>

        {/* Gold divider — premium accent */}
        <div
          className="mx-auto h-px w-24 sm:w-32 bg-gradient-to-r from-transparent via-[#c49746] to-transparent mb-3 tablet:mb-4 animate-fade-in"
          style={{ animationDelay: '0.08s' }}
          aria-hidden="true"
        />

        {/* Subtitle */}
        <p
          className="text-sm sm:text-base md:text-lg lg:text-xl text-white/90 font-display max-w-2xl mx-auto mb-4 tablet:mb-5 animate-fade-in"
          style={{
            animationDelay: '0.1s',
            textShadow: '0 2px 6px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.35)',
          }}
        >
          Built for group plans: Your important info synced across web &amp; mobile.
        </p>

        {/* CTA group — primary conversion action + soft product-tour path */}
        <div
          className="flex flex-wrap items-center justify-center gap-3 animate-fade-in"
          style={{ animationDelay: '0.14s' }}
        >
          <Button
            onClick={onSignUp}
            className="accent-fill-gold h-12 rounded-full px-8 text-base font-semibold tracking-wide backdrop-blur-md transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            Get Started — It's Free
          </Button>
          <button
            type="button"
            onClick={scrollToHowItWorks}
            className="group inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-6 text-base font-medium text-white/90 backdrop-blur-md transition-colors duration-200 hover:border-[#c49746]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c49746]"
          >
            See How It Works
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
          </button>
        </div>
      </div>

      {/* Demo Preview - fills the middle space */}
      <div className="flex-1 flex flex-col items-center justify-center py-3 tablet:py-4">
        <div
          className="w-full max-w-6xl mx-auto px-2 animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          {/* Premium frame: gold hairline ring + soft ambient glow behind the demo */}
          <div className="relative">
            <div
              className="absolute -inset-6 sm:-inset-10 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(196,151,70,0.14) 0%, rgba(196,151,70,0) 70%)',
              }}
              aria-hidden="true"
            />
            <div className="relative rounded-2xl p-px bg-gradient-to-b from-[#c49746]/45 via-white/10 to-white/5">
              <div className="relative rounded-[calc(1rem-1px)] overflow-hidden shadow-2xl shadow-black/50 aspect-video bg-[#070B1A]">
                {showVideo ? (
                  <>
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover object-bottom scale-[1.08] origin-bottom"
                      // src directly on <video> (not a <source> child) so a missing
                      // file fires onError here and the poster fallback engages.
                      src={HERO_VIDEO_SRC}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      poster={HERO_VIDEO_POSTER}
                      aria-label="ChravelApp trip dashboard product demo"
                      onError={() => setVideoFailed(true)}
                      onCanPlay={() => {
                        // Retry once if our initial play() lost the race with metadata.
                        if (autoplayBlocked) attemptPlay();
                      }}
                      onPlaying={() => setAutoplayBlocked(false)}
                    />
                    {autoplayBlocked && (
                      <button
                        type="button"
                        onClick={handleManualPlay}
                        aria-label="Play product demo video"
                        className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px] group focus:outline-none focus:ring-2 focus:ring-[#c49746]"
                      >
                        <span className="flex items-center justify-center w-20 h-20 rounded-full bg-black/55 border border-white/30 group-hover:scale-105 transition-transform">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-9 h-9 ml-1 fill-white"
                            aria-hidden="true"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <img
                    src={HERO_VIDEO_POSTER}
                    alt="ChravelApp trips dashboard preview"
                    className="w-full h-full object-cover object-bottom scale-[1.08] origin-bottom"
                    decoding="async"
                    {...({ fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>)}
                  />
                )}
                {/* Subtle overlay to blend edges */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#070B1A]/30 via-transparent to-transparent pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: proof strip — the six P's as an editorial index */}
      <div
        className="flex-shrink-0 flex flex-col items-center animate-fade-in"
        style={{ animationDelay: '0.15s' }}
      >
        <p className="sr-only">
          Plans, Photos, Places, Polls, PDFs, &amp; Payments — Privately Processed
        </p>
        <div
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-x-4 max-w-4xl"
          aria-hidden="true"
        >
          {HERO_PROOF_ITEMS.map((item, index) => (
            <React.Fragment key={item}>
              {index > 0 && <span className="inline-block h-1 w-1 rounded-full bg-[#c49746]/80" />}
              <span
                className="text-sm sm:text-base md:text-lg font-semibold tracking-wide text-white"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}
              >
                {item}
              </span>
            </React.Fragment>
          ))}
        </div>
        <p
          className="mt-2 text-xs sm:text-sm font-medium uppercase tracking-[0.28em] text-[#feeaa5]/90"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
          aria-hidden="true"
        >
          Privately Processed
        </p>
      </div>
    </div>
  );
};
