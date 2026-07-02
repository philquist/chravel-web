import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '../SectionHeader';

interface Scenario {
  title: string;
  subtitle: string;
  before: string;
  expandCTA: string;
  after: string;
  badge: string;
  isHero?: boolean;
  /** Links to the matching /use-cases page (or a /blog post) when one exists. */
  href?: string;
}

const scenarios: Scenario[] = [
  {
    title: 'Travel Concierge & Advisors',
    subtitle: 'Luxury planners · travel advisors · client trips · families',
    before:
      'After the client pays, the trip still arrives as scattered WhatsApp messages, PDFs, Google Drive links, and email chains.',
    expandCTA: 'ChravelApp helps you deliver a premium client experience',
    after:
      'Preload the itinerary, attachments, reservations, base camps, and tasks, then invite the client to one polished portal that already feels planned.',
    badge: 'Look more premium · fewer client questions',
    isHero: true,
    href: '/use-cases/travel-concierge-client-portal',
  },
  {
    title: 'Families & Parents',
    subtitle: 'Family calendar · practices · pickups · photos · chores · team carpools',
    before:
      'Practices, pickups, forms, and “what’s for dinner?” scattered across two calendars, a fridge flyer, and a dozen group texts.',
    expandCTA: 'ChravelApp helps families stay organized',
    after:
      'One shared family hub — calendar, photos, tickets, chores, dinner polls, and team carpools, all in sync so everyone knows where to be.',
    badge: 'Fewer missed pickups · more time together',
    href: '/use-cases/family-organization-app',
  },
  {
    title: 'Touring Artists & Crews',
    subtitle: 'Musicians · comedians · podcasts · managers · production',
    before: 'Spreadsheets, endless texts, missed details. Overwhelmed managers, annoyed artists.',
    expandCTA: 'ChravelApp helps tours stay in sync',
    after:
      'Show days, rehearsal times, off days, crew channels, logistics, and payments — all in one place. Everyone aligned, every city.',
    badge: 'Fewer mistakes · smoother tours',
    href: '/use-cases/music-tour-coordination',
  },
  {
    title: 'Bachelor & Bachelorette Parties → Wedding Weekends',
    subtitle: 'Bachelor & bachelorette trips · guests · families · vendors',
    before: 'Dozens of chats with too many guests asking the same questions over and over.',
    expandCTA: 'ChravelApp helps celebrations run smoothly',
    after:
      'Shared itinerary, approved wedding looks, pinned locations, group sharing of wedding photos — less confusion, more celebration.',
    badge: 'Fewer questions · more memories',
    href: '/use-cases/wedding-guest-coordination-app',
  },
  {
    title: 'Fraternities/Sororities & Similar Organizations',
    subtitle: 'Rush · Formals · retreats · philanthropy · chapter ops',
    before:
      'One giant group chat — endless scrollback, mixed events, sensitive moments living forever in one thread.',
    expandCTA: 'ChravelApp helps chapters stay private',
    after:
      'Separate vaults per event — Rush, Formal, Retreat. Chat and media stay compartmentalized. Access controlled, moments stay private.',
    badge: 'Private trip vaults with access controls',
    href: '/blog/fraternity-and-sorority-chapter-management-app',
  },
  {
    title: 'Youth, Amateur, & Pro sports programs.',
    subtitle: 'Players · coaches · coordinators · operations staff',
    before: 'Staff juggling travel, practices, and logistics across too many tools.',
    expandCTA: 'ChravelApp helps programs stay aligned',
    after:
      'Role-based access, team schedules, and instant updates — built to scale from Amateur to the Pros.',
    badge: 'Fewer errors · faster decisions',
    href: '/use-cases/sports-team-travel-coordination',
  },
  {
    title: 'Conferences & Events',
    subtitle: 'Organizers · speakers · production staff · attendees',
    before:
      'A printed agenda goes stale by the first session, speakers change slots last-minute, and attendees screenshot the schedule and miss the room swap.',
    expandCTA: 'ChravelApp helps events run on one source of truth',
    after:
      'A live agenda and speaker lineup, attendee broadcasts, session polls, staff tasks, venue maps, and a shared album — organizers, staff, and attendees all in one place.',
    badge: 'No stale handouts · nobody misses a room change',
    href: '/use-cases/conference-event-management-app',
  },
  {
    title: 'Local Clubs & Meetups',
    subtitle: 'Run clubs · trivia nights · rec leagues · golf groups · community meetups',
    before:
      'A different group text every week, RSVPs lost in the replies, and half the crew showing up to the wrong bar, course, or start line.',
    expandCTA: 'ChravelApp helps local crews stay in the loop',
    after:
      'One home base for the regulars — recurring schedule, RSVPs, the spot pinned on a map, a shared album, and one broadcast when plans change. No flight required.',
    badge: 'No plane ticket required · the regulars always know where to be',
    href: '/use-cases/local-clubs-meetups',
  },
  {
    title: 'Faith & Church Groups',
    subtitle: 'Mission trips · retreats · youth group · choir & worship tours',
    before:
      'Sign-up sheets, paper permission slips, a phone tree, and a dozen parent group texts for every trip.',
    expandCTA: 'ChravelApp helps ministries stay organized',
    after:
      'Rosters and roles, permission forms, the itinerary, trip-fee collection, broadcasts to every family, and a shared album — all in one place.',
    badge: 'Lead the trip, not the group chat',
    href: '/use-cases/church-group-trip-coordination',
  },
  {
    title: 'Business Travel & Company Retreats',
    subtitle: 'Coworkers · client meetings · offsites · company retreats · work dinners',
    before:
      'Work trips scattered across personal iMessage, forwarded confirmations, Slack DMs, and a Drive folder nobody remembers to open.',
    expandCTA: 'ChravelApp helps work trips stay contained',
    after:
      'A private trip workspace with the meeting itinerary, decks, receipts, per-person tasks, shared and personal base camps, and dinner splits — kept out of your personal texts.',
    badge: 'Aligned team · work chat out of personal texts',
    href: '/use-cases/business-travel-coordination',
  },
];


/** Per-destination CTA label so /use-cases cards never show blog-oriented copy. */
const cardLinkLabel = (href: string) =>
  href.startsWith('/blog') ? 'See the ChravelApp blog for more' : 'See how ChravelApp helps';

interface ScenarioCardProps {
  scenario: Scenario;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Editorial use-case tile: issue-number index, serif title, before/after
 * narrative with a gold "after" accent, and a per-card destination link.
 * The featured (isHero) scenario spans the full row as a magazine lead story.
 */
const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, index, isExpanded, onToggle }) => {
  const reduceMotion = useReducedMotion();
  const cardNumber = String(index + 1).padStart(2, '0');

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={onToggle}
      onKeyDown={e => {
        // Toggle only when the card itself is focused, so activating an inner
        // link (the CTA / hub links) doesn't also toggle the card.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px 25% 0px' }}
      transition={{ duration: 0.5, delay: Math.min(index % 3, 2) * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group/card relative overflow-hidden rounded-2xl border bg-card/50 p-5 sm:p-6 backdrop-blur-sm cursor-pointer',
        'transition-[border-color,box-shadow,transform,background-color] duration-300',
        'hover:-translate-y-1 hover:shadow-[0_18px_44px_-18px_rgba(196,151,70,0.28)] motion-reduce:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        'max-w-md mx-auto tablet:max-w-none w-full',
        isExpanded ? 'border-primary/50 bg-card/60' : 'hover:border-primary/40',
        scenario.isHero
          ? 'border-primary/40 shadow-lg shadow-primary/10 lg:col-span-3 tablet:col-span-2 lg:p-8'
          : 'border-border',
      )}
    >
      {/* Faint issue-number index — editorial signature */}
      <span
        className="pointer-events-none absolute -top-3 right-4 select-none font-display text-[64px] leading-none text-[#c49746]/[0.12] lg:text-[76px]"
        aria-hidden="true"
      >
        {cardNumber}
      </span>

      {/* Gold top rule that brightens on hover/expand */}
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c49746]/60 to-transparent transition-opacity duration-300',
          isExpanded ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-70',
        )}
        aria-hidden="true"
      />

      {scenario.isHero && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Featured
        </div>
      )}

      {/* Header */}
      <div className="mb-4 pr-10">
        <h3
          className={cn(
            'font-display font-normal leading-snug break-words text-white',
            scenario.isHero ? 'text-2xl tablet:text-3xl' : 'text-xl tablet:text-2xl',
          )}
        >
          {scenario.title}
        </h3>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground break-words">
          {scenario.subtitle}
        </p>
      </div>

      {/* Before Section - Always Visible */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-px w-4 bg-rose-400/60" aria-hidden="true" />
          <span className="text-[11px] sm:text-xs font-semibold text-rose-300/90 uppercase tracking-[0.18em]">
            Before: Chaos
          </span>
        </div>
        <p className="text-sm sm:text-base text-foreground/90 leading-relaxed break-words">
          {scenario.before}
        </p>
      </div>

      {/* Expand CTA - Only when collapsed */}
      <AnimatePresence mode="wait">
        {!isExpanded && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-3 flex items-center gap-1 text-sm sm:text-base font-medium text-primary"
          >
            <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover/card:translate-x-0.5 motion-reduce:group-hover/card:translate-x-0" />
            <span>{scenario.expandCTA}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={reduceMotion ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{
              height: { type: 'spring', stiffness: 220, damping: 28, mass: 0.9 },
              opacity: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
            }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              {/* After Section — gold, the brand's "resolved" state */}
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="h-px w-4 bg-[#c49746]" aria-hidden="true" />
                  <span className="text-[11px] sm:text-xs font-semibold text-[#feeaa5] uppercase tracking-[0.18em]">
                    After: Coordinated
                  </span>
                </div>
                <p className="text-sm sm:text-base text-foreground leading-relaxed break-words">
                  {scenario.after}
                </p>
              </div>

              {/* Outcome Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs sm:text-sm font-semibold tracking-wide text-primary">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
                {scenario.badge}
              </div>

              {/* Link to the full use-case page or blog post (when one exists) */}
              {scenario.href && (
                <div>
                  <Link
                    to={scenario.href}
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    {cardLinkLabel(scenario.href)}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const UseCasesSection = () => {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const toggleCard = (index: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start pt-8 pb-12 tablet:pb-16 space-y-4 tablet:space-y-6">
      <div className="container mx-auto px-4 relative z-10 flex flex-col items-center space-y-10 tablet:space-y-12">
        <SectionHeader
          eyebrow="Made for Your Crew"
          title={
            <>
              Built for <em>Every</em> Journey
            </>
          }
          lede="Travel Concierges, Sports Teams, Touring Crews, Family Vacations, Corporate Travel, Friend Groups, & Local Meetups — ChravelApp handles it all."
        />

        {/* Scenarios Grid — featured lead story spans the row; tiles fill beneath */}
        <div className="grid w-full max-w-7xl grid-cols-1 gap-4 sm:gap-5 tablet:grid-cols-2 tablet:gap-6 lg:grid-cols-3">
          {scenarios.map((scenario, index) => (
            <ScenarioCard
              key={scenario.title}
              scenario={scenario}
              index={index}
              isExpanded={expandedCards.has(index)}
              onToggle={() => toggleCard(index)}
            />
          ))}
        </div>

        {/* Explore the full cluster */}
        <Link
          to="/use-cases"
          className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-card/50 px-6 py-3 text-base font-semibold text-primary backdrop-blur-sm transition-colors hover:bg-primary/10"
        >
          Explore all use cases
          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
        </Link>
      </div>
    </div>
  );
};
