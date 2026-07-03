/**
 * SurveyResultScreen — the payoff. Reveals the chaos score as a diagnostic mirror,
 * reassures the user ("your tools are scattered, not you"), then hands off to the
 * personalized product tour.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SurveyResultScreenProps {
  chaosScore: number;
  /** Continue into the (personalized) product tour. */
  onShowDemo: () => void;
}

/** A short, score-tiered headline so the result feels responsive to the answers. */
function headlineFor(score: number): string {
  if (score >= 70) return "You don't need another group chat.";
  if (score >= 40) return 'Sound familiar?';
  return 'Even smooth trips have rough edges.';
}

export const SurveyResultScreen = ({ chaosScore, onShowDemo }: SurveyResultScreenProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center relative overflow-hidden">
      {/* Subtle gold shimmer background (matches FinalCTAScreen) */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full opacity-[0.08]"
          style={{
            background: 'radial-gradient(circle, hsl(38 61% 48%) 0%, transparent 70%)',
            animation: 'pulse 3s ease-in-out infinite',
          }}
        />
      </div>

      <motion.p
        className="text-sm uppercase tracking-widest text-ink-2 mb-3 relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        Your Trip Chaos Score
      </motion.p>

      <motion.div
        className="relative z-10 mb-6"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.2 }}
      >
        <span className="text-6xl sm:text-7xl font-bold text-primary">{chaosScore}</span>
        <span className="text-2xl font-semibold text-ink-2">/100</span>
      </motion.div>

      <motion.h1
        className="text-2xl sm:text-3xl font-bold text-ink-1 mb-2 relative z-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {headlineFor(chaosScore)}
      </motion.h1>

      <motion.p
        className="text-ink-2 text-base sm:text-lg max-w-sm mb-8 relative z-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        You&apos;re not bad at planning. Your tools are scattered. ChravelApp keeps the whole trip
        in one place.
      </motion.p>

      <motion.div
        className="w-full max-w-xs relative z-10"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <Button size="lg" className="w-full" onClick={onShowDemo}>
          <Play className="w-4 h-4 mr-2" />
          Show me the demo
        </Button>
      </motion.div>
    </div>
  );
};
