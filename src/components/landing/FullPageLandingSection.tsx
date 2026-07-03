import React from 'react';
import { cn } from '@/lib/utils';
import { GoldAccentOverlay } from './GoldAccentOverlay';

interface FullPageLandingSectionProps {
  id: string;
  enableSnapScroll?: boolean;
  minHeight?: string;
  children: React.ReactNode;
  className?: string;
  gradientColors?: [string, string, string?]; // Start, end, optional mid
  gradientDirection?: 'diagonal' | 'vertical' | 'radial';
  goldOverlay?: 'hero' | 'waves' | 'terraces' | 'diamonds' | 'circles' | 'mesh' | 'aurora' | 'none';
}

export const FullPageLandingSection: React.FC<FullPageLandingSectionProps> = ({
  id,
  enableSnapScroll: _enableSnapScroll = true,
  minHeight = '100vh',
  children,
  className,
  gradientColors = ['#000000', '#0a0a0a'],
  gradientDirection = 'diagonal',
  goldOverlay = 'waves',
}) => {
  // Build the gradient based on direction and colors
  const getGradientStyle = () => {
    const [start, end, mid] = gradientColors;

    if (gradientDirection === 'radial') {
      return mid
        ? `radial-gradient(ellipse at center, ${mid} 0%, ${start} 50%, ${end} 100%)`
        : `radial-gradient(ellipse at center bottom, ${start} 0%, ${end} 100%)`;
    }

    if (gradientDirection === 'vertical') {
      return mid
        ? `linear-gradient(180deg, ${start} 0%, ${mid} 50%, ${end} 100%)`
        : `linear-gradient(180deg, ${start} 0%, ${end} 100%)`;
    }

    // Default: diagonal
    return mid
      ? `linear-gradient(135deg, ${start} 0%, ${mid} 50%, ${end} 100%)`
      : `linear-gradient(135deg, ${start} 0%, ${end} 100%)`;
  };

  return (
    <section
      id={id}
      className={cn(
        'relative w-full flex overflow-hidden',
        // Mobile/phone: content flows from top naturally. Tablet+: vertically centered
        'items-start tablet:items-center justify-center',
        // Mobile/phone: fill viewport so content starts at top. Tablet+: use CSS variable for min-height
        'min-h-screen tablet:min-h-[var(--section-desktop-min-height,100vh)]',
        // Add top padding on mobile to account for header and safe areas
        'pt-20 tablet:pt-0',
        className,
      )}
      style={{
        ['--section-desktop-min-height' as string]: minHeight,
        background: getGradientStyle(),
      }}
    >
      {/* Gold decorative overlay — crisp per-section black/gold line-work.
          (The old film-grain layer is gone: at imperceptible opacity it only
          cost a full-viewport mix-blend compositing pass per section, and
          "crisp, not grainy" is the design goal.) */}
      {goldOverlay !== 'none' && <GoldAccentOverlay variant={goldOverlay} />}

      {/* Content */}
      <div className="relative z-10 w-full">{children}</div>
    </section>
  );
};
