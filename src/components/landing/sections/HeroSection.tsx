import React, { useState } from 'react';
import { Button } from '../../ui/button';

// Real-product-walkthrough video built from fresh demo-mode UI captures.
// Source: remotion/src/compositions/HomepageProductDemo60.tsx
// Regenerate: see public/videos/README.md (capture → render → poster).
// Served from public/ so the file ships with every deploy — no external
// asset store involved (a previous sandbox-only asset URL broke in prod).

const HERO_VIDEO_SRC = '/videos/chravel-homepage-demo-60.mp4';
const HERO_VIDEO_POSTER = '/videos/chravel-homepage-demo-60-poster.jpg';

interface HeroSectionProps {
  onSignUp: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onSignUp }) => {
  const [videoFailed, setVideoFailed] = useState(false);
  // Hero demo is muted + decorative — always autoplay regardless of
  // prefers-reduced-motion. Fallback to poster only on real load error.
  const showVideo = !videoFailed;


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
          Login or Signup
        </Button>
      </div>

      {/* Top Section: Brand + Headline + Subtitle */}
      <div className="flex-shrink-0 pt-4 tablet:pt-8">
        {/* Brand Name */}
        <div
          className="inline-block animate-fade-in mb-2 tablet:mb-3"
          style={{
            animationDelay: '0.05s',
          }}
        >
          <h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight"
            style={{
              textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            ChravelApp
          </h2>
        </div>

        {/* Pain-First Headline */}
        <div className="w-full flex items-center justify-center px-2 tablet:px-4 mb-2 tablet:mb-3">
          <h1
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight animate-fade-in text-center w-full"
            style={{
              textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            The Group Chat Travel App
          </h1>
        </div>

        {/* New Subtitle */}
        <p
          className="text-sm sm:text-base md:text-lg lg:text-xl text-white/90 font-medium max-w-3xl mx-auto mb-3 tablet:mb-4 animate-fade-in"
          style={{
            animationDelay: '0.05s',
            textShadow: '0 2px 4px rgba(0,0,0,0.4)',
          }}
        >
          For Friend & Family trips, Team Travel, Touring Crews, Local Community Clubs, & Anybody
          Organizing a Group
        </p>
      </div>

      {/* Demo Preview Image - fills the middle space */}
      <div className="flex-1 flex flex-col items-center justify-center py-2 tablet:py-3">
        <div
          className="w-full max-w-6xl mx-auto px-2 animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 aspect-video bg-[#070B1A]">
            {showVideo ? (
              <video
                className="w-full h-full object-cover scale-[1.18]"

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
              />
            ) : (
              <img
                src={HERO_VIDEO_POSTER}
                alt="ChravelApp trips dashboard preview"
                className="w-full h-full object-cover scale-[1.18]"
                fetchPriority="high"
                decoding="async"
              />
            )}
            {/* Subtle overlay to blend edges */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#070B1A]/30 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>

        {/* Mobile CTA - centered below preview */}
        <Button
          onClick={onSignUp}
          className="mt-4 px-6 py-3 accent-fill-gold backdrop-blur-md rounded-xl text-base font-semibold animate-fade-in lg:hidden"
          style={{ animationDelay: '0.2s' }}
        >
          Login or Signup
        </Button>
      </div>

      {/* Bottom Section: Hero copy */}
      <div className="flex-shrink-0 flex flex-col items-center">
        {/* Secondary tagline */}
        <div
          className="inline-block animate-fade-in"
          style={{
            animationDelay: '0.1s',
          }}
        >
          <h3
            className="text-xl sm:text-2xl md:text-3xl lg:text-3xl font-bold leading-tight text-white"
            style={{
              textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            Less Chaos, More Coordination
          </h3>
        </div>

        {/* Subheadline */}
        <p
          className="text-base sm:text-lg md:text-xl lg:text-2xl text-white font-bold max-w-4xl animate-fade-in mt-3 tablet:mt-4"
          style={{
            animationDelay: '0.15s',
            textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          Plans, photos, places, and payments — one private place for every trip.
        </p>
      </div>
    </div>
  );
};
