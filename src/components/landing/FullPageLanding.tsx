import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { FullPageLandingSection } from './FullPageLandingSection';
import { StickyLandingNav } from './StickyLandingNav';
import { MobileLandingNav } from './MobileLandingNav';
import { HeroSection } from './sections/HeroSection';
import { ProblemSolutionSection } from './sections/ProblemSolutionSection';

// Lazy load sections for better performance
const AiFeaturesSection = lazy(() =>
  import('./sections/AiFeaturesSection').then(module => ({ default: module.AiFeaturesSection })),
);
const UseCasesSection = lazy(() =>
  import('./sections/UseCasesSection').then(module => ({ default: module.UseCasesSection })),
);
const ReplacesSection = lazy(() =>
  import('./sections/ReplacesSection').then(module => ({ default: module.ReplacesSection })),
);
const FAQSection = lazy(() =>
  import('./sections/FAQSection').then(module => ({ default: module.FAQSection })),
);
const PricingLandingSection = lazy(() =>
  import('./sections/PricingLandingSection').then(module => ({
    default: module.PricingLandingSection,
  })),
);
const FooterSection = lazy(() =>
  import('./FooterSection').then(module => ({ default: module.FooterSection })),
);

// Premium Black & Gold Design System.
// Source of truth: src/index.css (:root gold tokens) + tailwind.config.ts
// (gold-primary/gold-light/gold-dark/gold-mid). Inline copies exist because
// these feed canvas/inline-style gradients — keep hexes in sync when the
// palette changes.
const DESIGN_TOKENS = {
  pureBlack: '#000000',
  richBlack: '#0a0a0a',
  darkCharcoal: '#121212',
  goldPrimary: '#c49746',
  goldLight: '#feeaa5',
  goldDark: '#533517',
  goldGlow: 'rgba(232,175,72,0.25)',
  goldSoftGlow: 'rgba(232,175,72,0.12)',
  goldAccentGlow: 'rgba(196,151,70,0.15)',
};

const GRADIENTS = {
  hero: {
    colors: [DESIGN_TOKENS.pureBlack, DESIGN_TOKENS.richBlack, DESIGN_TOKENS.darkCharcoal] as [
      string,
      string,
      string,
    ],
    direction: 'vertical' as const,
    accentGlow: { color: DESIGN_TOKENS.goldGlow, position: 'top' as const, opacity: 0.3 },
  },
  replaces: {
    colors: [DESIGN_TOKENS.richBlack, DESIGN_TOKENS.pureBlack] as [string, string],
    direction: 'diagonal' as const,
    accentGlow: { color: DESIGN_TOKENS.goldSoftGlow, position: 'center' as const, opacity: 0.2 },
  },
  howItWorks: {
    colors: [DESIGN_TOKENS.pureBlack, DESIGN_TOKENS.darkCharcoal] as [string, string],
    direction: 'vertical' as const,
    accentGlow: { color: DESIGN_TOKENS.goldGlow, position: 'bottom' as const, opacity: 0.18 },
  },
  useCases: {
    colors: [DESIGN_TOKENS.darkCharcoal, DESIGN_TOKENS.pureBlack] as [string, string],
    direction: 'diagonal' as const,
    accentGlow: { color: DESIGN_TOKENS.goldAccentGlow, position: 'top' as const, opacity: 0.22 },
  },
  aiFeatures: {
    colors: [DESIGN_TOKENS.pureBlack, DESIGN_TOKENS.richBlack] as [string, string],
    direction: 'vertical' as const,
    accentGlow: { color: DESIGN_TOKENS.goldGlow, position: 'center' as const, opacity: 0.2 },
  },
  pricing: {
    colors: [DESIGN_TOKENS.richBlack, DESIGN_TOKENS.darkCharcoal] as [string, string],
    direction: 'diagonal' as const,
    accentGlow: { color: DESIGN_TOKENS.goldSoftGlow, position: 'top' as const, opacity: 0.25 },
  },
  faq: {
    colors: [DESIGN_TOKENS.pureBlack, DESIGN_TOKENS.richBlack] as [string, string],
    direction: 'vertical' as const,
    accentGlow: { color: DESIGN_TOKENS.goldAccentGlow, position: 'bottom' as const, opacity: 0.15 },
  },
};

interface FullPageLandingProps {
  onSignUp: () => void;
}

// Loading fallback — neutral, no spinner/wordmark so the homepage never flashes a splash.
const SectionLoader = () => <div className="min-h-screen bg-background" />;

export const FullPageLanding: React.FC<FullPageLandingProps> = ({ onSignUp }) => {
  // Landing scrolls this element, not `window`. StickyLandingNav must listen here
  // or `window.scrollY` stays 0 and the desktop nav stays permanently hidden.
  const [landingScrollEl, setLandingScrollEl] = useState<HTMLDivElement | null>(null);
  const landingScrollRef = useCallback((node: HTMLDivElement | null) => {
    setLandingScrollEl(node);
  }, []);

  // Marketing landing is dark-only. Force-remove the user's `light` theme class
  // while mounted so global light-mode token remaps don't bleed into the page.
  useEffect(() => {
    const root = document.documentElement;
    const wasLight = root.classList.contains('light');
    if (wasLight) root.classList.remove('light');
    return () => {
      if (wasLight) root.classList.add('light');
    };
  }, []);

  return (
    <>
      {/* Sticky Navigation - desktop only */}
      <StickyLandingNav onSignUp={onSignUp} scrollRoot={landingScrollEl} />

      {/* Mobile/tablet navigation - hamburger menu (desktop nav is hidden below lg) */}
      <MobileLandingNav onSignUp={onSignUp} />

      {/* Full-Page Scrolling Container with PWA safe-area support */}
      <div
        ref={landingScrollRef}
        className="overflow-y-auto overflow-x-hidden h-screen scroll-smooth"
        style={{
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {/* Section 1: Hero — golden-ratio arcs */}
        <FullPageLandingSection
          id="section-hero"
          gradientColors={GRADIENTS.hero.colors}
          gradientDirection={GRADIENTS.hero.direction}
          accentGlow={GRADIENTS.hero.accentGlow}
          minHeight="90vh"
          goldOverlay="hero"
        >
          <HeroSection onSignUp={onSignUp} />
        </FullPageLandingSection>

        {/* Section 2: What It Replaces — layered sine strata */}
        <FullPageLandingSection
          id="section-replaces"
          gradientColors={GRADIENTS.replaces.colors}
          gradientDirection={GRADIENTS.replaces.direction}
          goldOverlay="waves"
        >
          <Suspense fallback={<SectionLoader />}>
            <ReplacesSection />
          </Suspense>
        </FullPageLandingSection>

        {/* Section 3: How It Works — terraced horizon */}
        <FullPageLandingSection
          id="section-features"
          gradientColors={GRADIENTS.howItWorks.colors}
          gradientDirection={GRADIENTS.howItWorks.direction}
          accentGlow={GRADIENTS.howItWorks.accentGlow}
          goldOverlay="terraces"
        >
          <ProblemSolutionSection />
        </FullPageLandingSection>

        {/* Section 4: Use Cases — faceted lattice */}
        <FullPageLandingSection
          id="section-use-cases"
          gradientColors={GRADIENTS.useCases.colors}
          gradientDirection={GRADIENTS.useCases.direction}
          accentGlow={GRADIENTS.useCases.accentGlow}
          minHeight="120vh"
          goldOverlay="diamonds"
        >
          <Suspense fallback={<SectionLoader />}>
            <UseCasesSection />
          </Suspense>
        </FullPageLandingSection>

        {/* Section 5: AI Features — orbital rings */}
        <FullPageLandingSection
          id="section-ai"
          gradientColors={GRADIENTS.aiFeatures.colors}
          gradientDirection={GRADIENTS.aiFeatures.direction}
          accentGlow={GRADIENTS.aiFeatures.accentGlow}
          goldOverlay="circles"
        >
          <Suspense fallback={<SectionLoader />}>
            <AiFeaturesSection />
          </Suspense>
        </FullPageLandingSection>

        {/* Section 6: Pricing — radial ledger lines */}
        <FullPageLandingSection
          id="section-pricing"
          gradientColors={GRADIENTS.pricing.colors}
          gradientDirection={GRADIENTS.pricing.direction}
          accentGlow={GRADIENTS.pricing.accentGlow}
          minHeight="110vh"
          goldOverlay="mesh"
        >
          <Suspense fallback={<SectionLoader />}>
            <PricingLandingSection onSignUp={onSignUp} />
          </Suspense>
        </FullPageLandingSection>

        {/* Section 7: FAQ — deep parallax aurora bands */}
        <FullPageLandingSection
          id="section-faq"
          gradientColors={GRADIENTS.faq.colors}
          gradientDirection={GRADIENTS.faq.direction}
          accentGlow={GRADIENTS.faq.accentGlow}
          goldOverlay="aurora"
        >
          <Suspense fallback={<SectionLoader />}>
            <FAQSection />
          </Suspense>
        </FullPageLandingSection>

        {/* Footer */}
        <div id="section-footer">
          <Suspense fallback={<SectionLoader />}>
            <FooterSection />
          </Suspense>
        </div>
      </div>
    </>
  );
};
