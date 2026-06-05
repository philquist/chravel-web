/**
 * Media Demo Screen — Shared album activity feed
 *
 * ~6s loop: header → 5 media upload rows → counter → reset
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoMediaRow } from '../primitives';
import { motion as motionPreset, LOOP_DURATION } from '../tokens';
import { Images } from 'lucide-react';

const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: motionPreset.slideIn,
};

export const MediaDemoScreen = () => {
  const [cycle, setCycle] = useState(0);
  const [step, setStep] = useState(0);

  const resetAndLoop = useCallback(() => {
    setStep(0);
    setCycle(c => c + 1);
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400), // header
      setTimeout(() => setStep(2), 900), // row 1
      setTimeout(() => setStep(3), 1500), // row 2
      setTimeout(() => setStep(4), 2100), // row 3
      setTimeout(() => setStep(5), 2700), // row 4
      setTimeout(() => setStep(6), 3300), // row 5
      setTimeout(() => setStep(7), 4200), // counter
      setTimeout(resetAndLoop, LOOP_DURATION * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [cycle, resetAndLoop]);

  return (
    <div className="flex flex-col h-full px-3 py-3 gap-2.5">
      <AnimatePresence>
        {/* Header */}
        {step >= 1 && (
          <motion.div key={`${cycle}-header`} {...slideUp} className="flex items-center gap-2 px-1">
            <Images className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Shared Album</span>
            {step >= 7 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={motionPreset.micro}
                className="text-[10px] text-green-400 ml-auto"
              >
                ✓ 29 items shared
              </motion.span>
            )}
          </motion.div>
        )}

        {/* Aubrey Gram — Videos */}
        {step >= 2 && (
          <motion.div key={`${cycle}-media1`} {...slideUp}>
            <DemoMediaRow
              avatar={{ initial: 'A', color: 'bg-pink-500' }}
              name="Aubrey Gram"
              count={3}
              mediaType="video"
              tripName="Music Festival Trip"
            />
          </motion.div>
        )}

        {/* Coach Carter — Photos */}
        {step >= 3 && (
          <motion.div key={`${cycle}-media2`} {...slideUp}>
            <DemoMediaRow
              avatar={{ initial: 'C', color: 'bg-blue-600' }}
              name="Coach Carter"
              count={12}
              mediaType="photo"
              tripName="Championship Game"
            />
          </motion.div>
        )}

        {/* Stacy Sprintz — Files */}
        {step >= 4 && (
          <motion.div key={`${cycle}-media3`} {...slideUp}>
            <DemoMediaRow
              avatar={{ initial: 'S', color: 'bg-amber-500' }}
              name="Stacy Sprintz"
              count={4}
              mediaType="file"
              tripName="Hannah Gets Hitched"
            />
          </motion.div>
        )}

        {/* Maya Chen — Photos */}
        {step >= 5 && (
          <motion.div key={`${cycle}-media4`} {...slideUp}>
            <DemoMediaRow
              avatar={{ initial: 'M', color: 'bg-purple-500' }}
              name="Maya Chen"
              count={8}
              mediaType="photo"
              tripName="Bali Yoga Retreat"
            />
          </motion.div>
        )}

        {/* Diego Ruiz — Videos */}
        {step >= 6 && (
          <motion.div key={`${cycle}-media5`} {...slideUp}>
            <DemoMediaRow
              avatar={{ initial: 'D', color: 'bg-emerald-500' }}
              name="Diego Ruiz"
              count={2}
              mediaType="video"
              tripName="Bachelor Party Vegas"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
