import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Editorial primitives for the marketing article surfaces (use cases, blog).
 *
 * Visual grammar: high-tech reporting site (kicker chip, big serif headline,
 * dek, hairline meta rail) rendered in the Chravel black/metallic-gold
 * system — not old-newspaper, not default-SaaS. Everything here assumes a
 * dark, [data-marketing]-scoped page (Fraunces headings arrive via CSS).
 */

/** Uppercase gold section kicker with a leading square tick — story-tag style. */
export const EditorialKicker: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-gold-light/90 ${className}`}
  >
    <span className="inline-block h-1.5 w-1.5 bg-gold-primary" aria-hidden="true" />
    {children}
  </span>
);

/** Thin gold gradient rule — the editorial divider. */
export const GoldRule: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`h-px bg-gradient-to-r from-transparent via-gold-primary/70 to-transparent ${className}`}
    aria-hidden="true"
  />
);

interface ArticleHeaderProps {
  kicker: string;
  title: string;
  dek: string;
  /** e.g. "The ChravelApp Team" */
  byline?: string;
  /** e.g. "6 min read" */
  readingTime?: string;
  breadcrumb?: Array<{ label: string; to?: string }>;
}

/** Article opener: breadcrumb → kicker → serif headline → dek → meta rail. */
export const ArticleHeader: React.FC<ArticleHeaderProps> = ({
  kicker,
  title,
  dek,
  byline,
  readingTime,
  breadcrumb,
}) => (
  <header className="space-y-5">
    {breadcrumb && (
      <nav aria-label="Breadcrumb" className="text-sm text-white/45">
        <ol className="flex flex-wrap items-center gap-2">
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={crumb.label}>
              {i > 0 && (
                <li aria-hidden="true" className="text-gold-primary/50">
                  /
                </li>
              )}
              <li>
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-gold-light transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-white/75">{crumb.label}</span>
                )}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </nav>
    )}
    <EditorialKicker>{kicker}</EditorialKicker>
    <h1 className="text-4xl md:text-5xl lg:text-6xl leading-[1.06] text-white max-w-4xl">
      {title}
    </h1>
    <p className="text-lg md:text-2xl font-normal leading-relaxed text-white/70 max-w-3xl">{dek}</p>
    {(byline || readingTime) && (
      <div className="flex flex-wrap items-center gap-2 border-y border-white/10 py-3 text-sm text-white/55">
        {byline && <span className="font-medium text-white/75">{byline}</span>}
        {byline && readingTime && (
          <span className="text-gold-primary/70" aria-hidden="true">
            ·
          </span>
        )}
        {readingTime && <span>{readingTime}</span>}
      </div>
    )}
  </header>
);

/** Numbered serif section heading — "01 — Heading" reporting style. */
export const SectionHeading: React.FC<{ index?: number; children: React.ReactNode }> = ({
  index,
  children,
}) => (
  <h2 className="flex items-baseline gap-3 text-2xl md:text-3xl text-white">
    {typeof index === 'number' && (
      <span
        className="font-display text-base md:text-lg italic text-gold-primary/80 tabular-nums whitespace-pre"
        aria-hidden="true"
      >
        {"\n"}
      </span>
    )}
    <span>{children}</span>
  </h2>
);

interface ClosingFigureProps {
  src: string;
  alt: string;
  caption: string;
  kicker?: string;
}

/** Full-width closing photograph with a captioned gold rail — how every
 *  use-case story signs off. Real photography only. */
export const ClosingFigure: React.FC<ClosingFigureProps> = ({
  src,
  alt,
  caption,
  kicker = 'In the Field',
}) => (
  <figure className="space-y-4">
    <EditorialKicker>{kicker}</EditorialKicker>
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="aspect-[16/9] w-full object-cover"
      />
    </div>
    <figcaption className="flex items-start gap-3 text-sm md:text-base text-white/60">
      <span className="mt-2 h-px w-8 shrink-0 bg-gold-primary/70" aria-hidden="true" />
      <em className="font-display italic">{caption}</em>
    </figcaption>
  </figure>
);

/** Estimate reading time from article text chunks (~220 wpm). */
export const readingTimeFor = (chunks: string[]): string => {
  const words = chunks.join(' ').split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min read`;
};
