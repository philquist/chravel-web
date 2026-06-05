/**
 * Polls Demo Screen — Group decision-making with live voting
 *
 * ~6s loop: header → Poll A (bachelorette city) → Poll B (Vegas budget)
 *         → Poll C (group dinner night) → summary badge → reset
 *
 * Three distinct polls stay on screen together so the value is obvious at a glance.
 * Each poll is kept to 3 options so all three fit the frame without clipping.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoPollCard } from '../primitives';
import { motion as motionPreset, LOOP_DURATION } from '../tokens';
import { BarChart3 } from 'lucide-react';

const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: motionPreset.slideIn,
};

export const PollsDemoScreen = () => {
  const [cycle, setCycle] = useState(0);
  const [step, setStep] = useState(0);

  const resetAndLoop = useCallback(() => {
    setStep(0);
    setCycle(c => c + 1);
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 1200),
      setTimeout(() => setStep(3), 2400),
      setTimeout(() => setStep(4), 3600),
      setTimeout(() => setStep(5), 4600),
      setTimeout(resetAndLoop, LOOP_DURATION * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [cycle, resetAndLoop]);

  return (
    <div className="flex flex-col h-full px-3 py-3 gap-2">
      <AnimatePresence>
        {/* Header */}
        {step >= 1 && (
          <motion.div key={`${cycle}-header`} {...slideUp} className="flex items-center gap-2 px-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Group Polls</span>
            <span className="text-[10px] text-muted-foreground ml-auto">3 active</span>
          </motion.div>
        )}

        {/* Poll A: Bachelorette city */}
        {step >= 2 && (
          <motion.div key={`${cycle}-pollA`} {...slideUp}>
            <DemoPollCard
              question="Which city for the bachelorette party?"
              options={[
                { text: 'Miami', votes: 5 },
                { text: 'Nashville', votes: 3 },
                { text: 'Costa Rica', votes: 7 },
              ]}
              totalVotes={15}
            />
          </motion.div>
        )}

        {/* Poll B: Vegas budget */}
        {step >= 3 && (
          <motion.div key={`${cycle}-pollB`} {...slideUp}>
            <DemoPollCard
              question="Max budget for Vegas?"
              options={[
                { text: '$1,500', votes: 2 },
                { text: '$2,500', votes: 6 },
                { text: '$5,000', votes: 4 },
              ]}
              totalVotes={12}
            />
          </motion.div>
        )}

        {/* Poll C: Group dinner night */}
        {step >= 4 && (
          <motion.div key={`${cycle}-pollC`} {...slideUp}>
            <DemoPollCard
              question="Which night for the group dinner?"
              options={[
                { text: 'Friday', votes: 4 },
                { text: 'Saturday', votes: 8 },
                { text: 'Sunday', votes: 1 },
              ]}
              totalVotes={13}
            />
          </motion.div>
        )}

        {/* Summary badge */}
        {step >= 5 && (
          <motion.div
            key={`${cycle}-summary`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={motionPreset.micro}
            className="flex items-center gap-1.5 px-1"
          >
            <span className="text-[10px] text-green-400">✓ 40 votes across 3 polls</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
