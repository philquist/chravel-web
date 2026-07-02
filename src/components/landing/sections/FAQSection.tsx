import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeader } from '../SectionHeader';

const faqItems = [
  {
    question: 'Who is ChravelApp for?',
    answer:
      'Anyone organizing a group — work, sports, tours, conferences, vacations, or local events.',
  },
  {
    question: 'Why not just use the apps I already have?',
    answer:
      "Your texts don't know what's in your calendar. Your spreadsheet doesn't know what's in your group chat. ChravelApp's 8 tabs are fully interconnected — one trip brain instead of 8 disconnected apps.",
  },
  {
    question: 'What happens when I hit my 3-trip limit?',
    answer:
      "You'll need to delete an old trip to create a new one. Or upgrade to Explorer to keep unlimited trips!",
  },
  {
    question: 'How do AI queries work on each plan?',
    answer:
      'Free: 3 AI queries per user per trip. Explorer: 25. Frequent Chraveler: unlimited. Voice input to the AI concierge counts as one query. Each new trip resets your limit.',
  },
  {
    question: 'Can I change plans anytime?',
    answer: 'Yes! Upgrade, downgrade, or cancel anytime. No contracts, no hassles.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'All data is encrypted in transit and at rest. Row-level security ensures you only see trips you belong to. High Privacy mode adds end-to-end encryption for messages. Your trips are private unless you choose to share them.',
  },
  {
    question: 'Do all trip members need to pay?',
    answer:
      'Trips are free with limited features. Upgrade for unlimited trips and more. For Pro, only the admin pays and assigns seats — ideal for teams.',
  },
  {
    question: "What's included with the free Pro Trip and events?",
    answer:
      'Every account gets 1 free Pro trip and up to 3 events. Unlimited events are included with Frequent Chraveler — no separate events plan needed.',
  },
  {
    question: 'Are Events included in my subscription?',
    answer:
      'Yes — events are bundled into every plan. Free and Explorer include up to 3 events; Frequent Chraveler and Pro tiers include unlimited events, built for large groups.',
  },
];
export const FAQSection = () => {
  return (
    <div className="container mx-auto px-4 py-8 tablet:py-16 flex flex-col items-center justify-start tablet:justify-center min-h-0 tablet:min-h-screen space-y-8 tablet:space-y-12">
      {/* Header */}
      <SectionHeader
        eyebrow="Good to Know"
        title={
          <>
            Frequently Asked <em>Questions</em>
          </>
        }
        lede="Got questions? We've got answers."
      />

      {/* FAQ Items */}
      <Accordion type="single" collapsible className="w-full max-w-3xl space-y-4">
        {faqItems.map((item, index) => (
          <AccordionItem
            key={index}
            value={`faq-${index}`}
            className="bg-card/50 backdrop-blur-sm border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-300 data-[state=open]:border-primary/50"
          >
            <AccordionTrigger className="w-full px-6 py-4 text-left hover:bg-card/30 transition-colors hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="font-semibold text-lg tablet:text-xl text-foreground pr-4">
                {item.question}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-6 pb-4 pt-2 text-base tablet:text-lg text-foreground leading-relaxed">
                {item.answer}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};
