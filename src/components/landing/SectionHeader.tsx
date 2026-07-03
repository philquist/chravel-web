import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  /** Uppercase tracked kicker above the headline, e.g. "The System". */
  eyebrow: string;
  /** Serif display headline. Use <em> for the editorial italic accent. */
  title: React.ReactNode;
  /** Optional lede below the headline. */
  lede?: React.ReactNode;
  align?: 'center' | 'left';
  className?: string;
}

/**
 * Shared editorial section header for the marketing landing.
 *
 * One typographic system across every section: gold-rule eyebrow →
 * Fraunces display headline → lighter Inter lede at a readable measure.
 * Reveals once on viewport entry; respects prefers-reduced-motion.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  eyebrow,
  title,
  lede,
  align = 'center',
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const centered = align === 'center';

  return (
    <motion.div
      className={cn('max-w-4xl', centered ? 'mx-auto text-center' : 'text-left', className)}
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      // Positive bottom margin starts the reveal just before entry, so fast
      // scrolling never lands on a blank (pre-reveal) section.
      viewport={{ once: true, margin: '0px 0px 25% 0px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          'mb-4 flex items-center gap-3',
          centered ? 'justify-center' : 'justify-start',
        )}
        aria-hidden="true"
      >
        <span className="h-px w-8 sm:w-10 bg-gradient-to-r from-transparent to-[#c49746]" />
        <span
          className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.32em] text-[#feeaa5]"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {eyebrow}
        </span>
        {centered && (
          <span className="h-px w-8 sm:w-10 bg-gradient-to-l from-transparent to-[#c49746]" />
        )}
      </div>

      <h2
        className="font-display font-normal text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white leading-[1.06] tracking-tight"
        style={{
          textShadow:
            '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4), 0 0 36px rgba(196,151,70,0.16)',
        }}
      >
        {title}
      </h2>

      {lede && (
        <p
          className={cn(
            'marketing-lede mt-4 max-w-2xl text-base sm:text-lg md:text-xl leading-relaxed text-white/85 font-light',
            centered && 'mx-auto',
          )}
          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.55)' }}
        >
          {lede}
        </p>
      )}
    </motion.div>
  );
};
