import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BLOG_PATH, estimateReadingMinutes, formatBlogDate, getSortedBlogPosts } from '@/lib/blog';
import { SectionHeader } from '../SectionHeader';
import { Button } from '../../ui/button';

interface JournalSectionProps {
  onSignUp: () => void;
}

/**
 * "From the Journal" — magazine-style preview of the three newest blog posts,
 * followed by the closing conversion band. Content is data-driven from the
 * static registry in src/lib/blog.ts (same source as /blog), so there is no
 * async loading state; routes are the existing /blog/:slug pages.
 */
export const JournalSection: React.FC<JournalSectionProps> = ({ onSignUp }) => {
  const reduceMotion = useReducedMotion();
  const posts = getSortedBlogPosts().slice(0, 3);
  const [lead, ...rest] = posts;

  if (!lead) return null;

  return (
    <div className="container mx-auto px-4 py-12 tablet:py-20 flex flex-col items-center space-y-10 tablet:space-y-14">
      <SectionHeader
        eyebrow="Field Notes"
        title={
          <>
            From the <em>Journal</em>
          </>
        }
        lede="Practical guides on coordinating group travel, events, and moving teams — from wedding weekends to touring runs."
      />

      {/* Editorial layout: lead story left, stacked briefs right */}
      <div className="grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-5 lg:gap-6">
        {/* Lead story */}
        <motion.div
          className="lg:col-span-3"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '0px 0px 25% 0px' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            to={`${BLOG_PATH}/${lead.slug}`}
            className={cn(
              'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/50 p-6 sm:p-8 backdrop-blur-sm',
              'transition-[border-color,box-shadow,transform] duration-300',
              'hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_18px_44px_-18px_rgba(196,151,70,0.28)] motion-reduce:hover:translate-y-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
            )}
          >
            <span
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c49746]/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden="true"
            />
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {lead.tags?.[0] && (
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-semibold uppercase tracking-[0.14em] text-primary">
                  {lead.tags[0]}
                </span>
              )}
              <time dateTime={lead.datePublished}>{formatBlogDate(lead.datePublished)}</time>
              <span aria-hidden="true">·</span>
              <span>{estimateReadingMinutes(lead)} min read</span>
            </div>
            <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-normal leading-[1.12] text-white">
              {lead.h1}
            </h3>
            <p className="mt-4 max-w-prose text-sm sm:text-base leading-relaxed text-muted-foreground line-clamp-4">
              {lead.excerpt}
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary">
              Read article
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
                aria-hidden="true"
              />
            </span>
          </Link>
        </motion.div>

        {/* Stacked briefs */}
        <div className="flex flex-col gap-5 lg:col-span-2 lg:gap-6">
          {rest.map((post, index) => (
            <motion.div
              key={post.slug}
              className="flex-1"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px 25% 0px' }}
              transition={{
                duration: 0.55,
                delay: 0.1 + index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Link
                to={`${BLOG_PATH}/${post.slug}`}
                className={cn(
                  'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card/50 p-5 sm:p-6 backdrop-blur-sm',
                  'transition-[border-color,box-shadow,transform] duration-300',
                  'hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_18px_44px_-18px_rgba(196,151,70,0.24)] motion-reduce:hover:translate-y-0',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                )}
              >
                <span
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c49746]/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden="true"
                />
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {post.tags?.[0] && (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-semibold uppercase tracking-[0.14em] text-primary">
                      {post.tags[0]}
                    </span>
                  )}
                  <time dateTime={post.datePublished}>{formatBlogDate(post.datePublished)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{estimateReadingMinutes(post)} min read</span>
                </div>
                <h3 className="font-display text-lg sm:text-xl font-normal leading-snug text-white">
                  {post.h1}
                </h3>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-primary">
                  Read article
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <Link
        to={BLOG_PATH}
        className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-card/50 px-6 py-3 text-base font-semibold text-primary backdrop-blur-sm transition-colors hover:bg-primary/10"
      >
        Read the ChravelApp blog
        <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
      </Link>

      {/* Closing conversion band */}
      <motion.div
        className="w-full max-w-4xl"
        initial={reduceMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px 25% 0px' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative overflow-hidden rounded-3xl border border-[#c49746]/30 bg-gradient-to-b from-white/[0.05] to-transparent p-8 sm:p-12 text-center backdrop-blur-sm">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 80% 70% at 50% 0%, rgba(196,151,70,0.14) 0%, rgba(196,151,70,0) 65%)',
            }}
            aria-hidden="true"
          />
          <h2 className="relative font-display text-3xl sm:text-4xl md:text-5xl font-normal leading-[1.08] text-white">
            Your next trip, <em>coordinated</em>.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-base sm:text-lg font-light leading-relaxed text-white/85">
            Create a trip, share one link, and give the whole group a single source of truth — free
            to start.
          </p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={onSignUp}
              className="accent-fill-gold h-12 rounded-full px-8 text-base font-semibold tracking-wide transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              Get Started — It's Free
            </Button>
            <Link
              to="/use-cases"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-6 text-base font-medium text-white/90 transition-colors duration-200 hover:border-[#c49746]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c49746]"
            >
              Explore use cases
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
