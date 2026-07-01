import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
];

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
      <div className="container mx-auto px-4 relative z-10 flex flex-col items-center space-y-12">
        {/* Headline - positioned higher to avoid towel overlap */}
        <div className="text-center space-y-4 max-w-4xl">
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight"
            style={{
              textShadow:
                '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4), 0 0 36px rgba(196,151,70,0.18)',
            }}
          >
            Built for Every Journey
          </h2>
          <p
            className="text-xl sm:text-2xl md:text-3xl text-white font-semibold max-w-3xl mx-auto"
            style={{
              textShadow: '0 2px 6px rgba(0,0,0,0.65), 0 4px 14px rgba(0,0,0,0.45)',
            }}
          >
            Travel Concierges, Sports Teams, Touring Crews, Family Vacations, Corporate Travel,
            Friend Groups, & Local Meetups — ChravelApp handles it all.
          </p>
        </div>

        {/* Scenarios Grid — single column on phones, 2-col on tablets (768px+), 3-col on desktop */}
        <div className="grid grid-cols-1 tablet:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 tablet:gap-6 max-w-7xl w-full">
          {scenarios.map((scenario, index) => {
            const isExpanded = expandedCards.has(index);

            return (
              <div
                key={index}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleCard(index)}
                onKeyDown={e => {
                  // Toggle only when the card itself is focused, so activating an inner
                  // link (the CTA / hub links) doesn't also toggle the card.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCard(index);
                  }
                }}
                className={cn(
                  'bg-card/50 backdrop-blur-sm border rounded-2xl p-4 sm:p-5 tablet:p-6 transition-all duration-300 cursor-pointer max-w-md mx-auto tablet:max-w-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  isExpanded ? 'border-primary/50 bg-card/60' : 'hover:border-primary/30',
                  scenario.isHero
                    ? 'border-primary/40 ring-2 ring-primary/20 shadow-lg shadow-primary/10'
                    : 'border-border',
                )}
              >
                {/* Header */}
                <div className="mb-4">
                  <h3 className="font-bold text-xl tablet:text-2xl leading-snug break-words">
                    {scenario.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground break-words">
                    {scenario.subtitle}
                  </p>
                </div>

                {/* Before Section - Always Visible */}
                <div className="mb-3">
                  <div className="text-xs sm:text-sm font-bold text-red-400 mb-1 uppercase tracking-wide">
                    Before: Chaos
                  </div>
                  <p className="text-sm sm:text-base tablet:text-lg text-foreground leading-relaxed break-words">
                    {scenario.before}
                  </p>
                </div>

                {/* Expand CTA - Only when collapsed */}
                <AnimatePresence mode="wait">
                  {!isExpanded && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1 text-primary text-sm sm:text-base font-medium mt-3"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>{scenario.expandCTA}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Expanded Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        {/* After Section */}
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-green-400 mb-1 uppercase tracking-wide">
                            After: Coordinated
                          </div>
                          <p className="text-sm sm:text-base tablet:text-lg text-foreground leading-relaxed break-words">
                            {scenario.after}
                          </p>
                        </div>

                        {/* Outcome Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-primary/40 bg-primary/10 text-primary rounded-full text-xs sm:text-sm font-semibold tracking-wide">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full bg-primary"
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
                              {scenario.href.startsWith('/blog')
                                ? 'See the ChravelApp blog for more'
                                : 'See the ChravelApp blog'}
                              <ArrowRight className="w-4 h-4" />
                            </Link>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Explore the full cluster */}
        <Link
          to="/use-cases"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-card/50 px-6 py-3 text-base font-semibold text-primary backdrop-blur-sm transition-colors hover:bg-primary/10"
        >
          Explore all use cases
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};
