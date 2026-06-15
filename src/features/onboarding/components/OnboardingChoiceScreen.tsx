/**
 * OnboardingChoiceScreen — choose-your-own-adventure entry for new users.
 *
 * Three doors, equal standing:
 *   1. Take the Trip Chaos survey → personalized tour
 *   2. See the demo → full product tour
 *   3. Jump straight in → skip everything, land on the dashboard
 *
 * Shown once per user (per device) before any survey/tour; refresh-safe via the
 * persisted path in useChaosSurveyStore.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Bomb, Play, ArrowRight, ChevronRight } from 'lucide-react';

interface ChoiceOption {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subcopy: string;
  onClick: () => void;
}

interface OnboardingChoiceScreenProps {
  /** Take the 5-question chaos diagnostic, then a personalized tour. */
  onTakeSurvey: () => void;
  /** Go straight into the full product tour. */
  onSeeDemo: () => void;
  /** Skip survey AND demo — complete onboarding and land on the dashboard. */
  onSkipToApp: () => void;
}

export const OnboardingChoiceScreen = ({
  onTakeSurvey,
  onSeeDemo,
  onSkipToApp,
}: OnboardingChoiceScreenProps) => {
  const options: ChoiceOption[] = [
    {
      icon: Bomb,
      title: 'Get my Trip Chaos Score',
      subcopy: '5 quick questions, then a demo tuned to your biggest pain. ~45 seconds.',
      onClick: onTakeSurvey,
    },
    {
      icon: Play,
      title: 'Show me the demo',
      subcopy: 'A quick tour of chat, calendar, payments, and everything else in one place.',
      onClick: onSeeDemo,
    },
    {
      icon: ArrowRight,
      title: 'Jump straight in',
      subcopy: 'I know my way around — take me to the app.',
      onClick: onSkipToApp,
    },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Choose how to start"
    >
      {/* Subtle gold shimmer background (matches the result + final CTA screens) */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.08]"
          style={{
            background: 'radial-gradient(circle, hsl(38 61% 48%) 0%, transparent 70%)',
            animation: 'pulse 3s ease-in-out infinite',
          }}
        />
      </div>

      <motion.h1
        className="text-2xl sm:text-3xl font-bold text-ink-1 mb-2 text-center relative z-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        Welcome to ChravelApp
      </motion.h1>
      <motion.p
        className="text-ink-2 text-base sm:text-lg mb-8 text-center max-w-sm relative z-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Pick your path — you can explore everything later.
      </motion.p>

      <div className="w-full max-w-md space-y-3 relative z-10">
        {options.map((option, index) => (
          <motion.button
            key={option.title}
            onClick={option.onClick}
            className="flex items-center gap-4 w-full rounded-enterprise border border-hairline-strong bg-surface-1 hover:bg-surface-1/70 hover:border-primary/50 px-5 py-4 text-left transition-colors group"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
          >
            <span className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <option.icon className="w-5 h-5 text-primary" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-ink-1">{option.title}</span>
              <span className="block text-sm text-ink-2 mt-0.5">{option.subcopy}</span>
            </span>
            <ChevronRight className="w-5 h-5 text-ink-2 shrink-0 group-hover:text-primary transition-colors" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};
