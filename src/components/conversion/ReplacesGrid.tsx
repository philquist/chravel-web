import React from 'react';
import { CATEGORIES } from './ReplacesGridData';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeader } from '@/components/landing/SectionHeader';

export const ReplacesGrid = () => {
  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 pt-8 sm:pt-6 pb-12 sm:pb-16">
      {/* Header */}
      <SectionHeader
        eyebrow="One App, Not Twelve"
        title={
          <>
            Why Juggle a <em>Dozen</em> Apps for One Trip?
          </>
        }
        lede="Select any category below to see how ChravelApp brings scattered planning into one streamlined flow."
        className="mb-8 tablet:mb-12 px-2"
      />

      {/* Accordion */}
      <Accordion type="multiple" className="divide-y divide-white/10 border-y border-white/10">
        {CATEGORIES.map(category => {
          const allApps = [...category.hero, ...category.full];

          return (
            <AccordionItem key={category.key} value={category.key} className="border-none">
              <AccordionTrigger className="px-2 sm:px-4 py-5 sm:py-4 hover:no-underline hover:bg-white/[0.03] transition-colors group">
                {/* Desktop/Tablet: 3-column grid (tablet 768px and up) */}
                <div className="hidden tablet:grid grid-cols-[200px_1fr_40px] lg:grid-cols-[220px_1fr_40px] gap-4 items-center w-full">
                  <span
                    className="flex items-center gap-2.5 text-xl lg:text-2xl font-bold text-white text-left"
                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                  >
                    <category.icon
                      className="h-5 w-5 shrink-0 text-gold-primary/80"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {category.title}
                  </span>
                  <div className="text-left">
                    {category.benefitQuote && (
                      <span className="block text-sm text-white/70 italic mb-0.5">
                        {category.benefitQuote}
                      </span>
                    )}
                    <span className="text-sm lg:text-base text-white italic font-medium">
                      {category.benefit}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col w-full tablet:hidden text-center">
                  {/* Feature Name — span, not a heading: AccordionTrigger is a
                      <button> already wrapped in Radix's <h3> header, so a
                      nested heading here breaks the a11y heading structure. */}
                  <span
                    className="mb-2 flex items-center justify-center gap-2.5 text-2xl sm:text-3xl font-bold text-white"
                    style={{
                      textShadow: '0 0 10px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.6)',
                    }}
                  >
                    <category.icon
                      className="h-6 w-6 shrink-0 text-gold-primary/80"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    {category.title}
                  </span>

                  {/* Optional quote - above description */}
                  {category.benefitQuote && (
                    <span
                      className="block text-sm text-white/80 italic mb-1"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                    >
                      {category.benefitQuote}
                    </span>
                  )}

                  {/* Description - Bright white, italic, readable, full width */}
                  <p
                    className="text-base sm:text-lg text-white italic font-medium leading-relaxed mb-3"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                  >
                    {category.benefit}
                  </p>
                </div>
              </AccordionTrigger>

              {/* Expanded Content */}
              <AccordionContent className="px-2 sm:px-4 pb-5">
                {/* Mobile/Phone: Center-aligned chips (hidden on tablet+) */}
                <div className="tablet:hidden">
                  <p className="text-xs text-white/60 uppercase tracking-wider mb-3 mt-1 font-semibold text-center">
                    Brings together the trip chaos usually scattered across:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {allApps.map((app, index) => (
                      <span
                        key={`${app.name}-${index}`}
                        className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                      >
                        {app.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Desktop/Tablet: Left-aligned chips (visible on tablet+ 768px) */}
                <div className="hidden tablet:block">
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-3 mt-2 font-medium">
                    Brings together the trip chaos usually scattered across:
                  </p>
                  <div className="flex flex-wrap gap-2 sm:gap-2.5">
                    {allApps.map((app, index) => (
                      <span
                        key={`${app.name}-${index}-desktop`}
                        className="bg-background/70 border border-border/50 rounded-lg px-3 py-1.5 text-sm font-bold text-white"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                      >
                        {app.name}
                      </span>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Bottom pull-quote — editorial close for the section */}
      <div className="text-center mt-10 tablet:mt-14 max-w-3xl mx-auto px-2">
        <div
          className="mx-auto mb-5 h-px w-16 bg-gradient-to-r from-transparent via-[#c49746] to-transparent"
          aria-hidden="true"
        />
        <p
          className="font-display text-xl sm:text-2xl md:text-3xl italic leading-snug text-white"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)' }}
        >
          ChravelApp's 8 core tabs cover your trip needs.
        </p>
      </div>
    </section>
  );
};
