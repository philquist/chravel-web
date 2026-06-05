/**
 * Places Demo Screen — Saved places with base-camp highlight
 *
 * ~6s loop: header → 5 saved places (hotel base camp, restaurant, museum, venue,
 *           airport) → base camp glow → reset
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoPlaceCard } from '../primitives';
import { motion as motionPreset, LOOP_DURATION } from '../tokens';
import { MapPin } from 'lucide-react';

const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: motionPreset.slideIn,
};

export const PlacesDemoScreen = () => {
  const [cycle, setCycle] = useState(0);
  const [step, setStep] = useState(0);

  const resetAndLoop = useCallback(() => {
    setStep(0);
    setCycle(c => c + 1);
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400), // header
      setTimeout(() => setStep(2), 1000), // hotel base camp
      setTimeout(() => setStep(3), 1700), // restaurant
      setTimeout(() => setStep(4), 2400), // museum
      setTimeout(() => setStep(5), 3100), // venue
      setTimeout(() => setStep(6), 3800), // airport
      setTimeout(() => setStep(7), 4600), // base camp glow
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
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Your Places</span>
            <span className="text-[10px] text-muted-foreground ml-auto">5 saved</span>
          </motion.div>
        )}

        {/* Hotel base camp */}
        {step >= 2 && (
          <motion.div key={`${cycle}-place1`} {...slideUp}>
            <DemoPlaceCard
              emoji="🏨"
              name="Hotel Nikkō"
              tag="Base Camp"
              saved
              highlight={step >= 7}
            />
          </motion.div>
        )}

        {/* Restaurant */}
        {step >= 3 && (
          <motion.div key={`${cycle}-place2`} {...slideUp}>
            <DemoPlaceCard emoji="🍣" name="Sushi Saito" tag="Dinner Spot" saved />
          </motion.div>
        )}

        {/* Museum */}
        {step >= 4 && (
          <motion.div key={`${cycle}-place3`} {...slideUp}>
            <DemoPlaceCard emoji="🎯" name="National Art Museum" tag="Day 2" saved />
          </motion.div>
        )}

        {/* Venue */}
        {step >= 5 && (
          <motion.div key={`${cycle}-place4`} {...slideUp}>
            <DemoPlaceCard emoji="🏟️" name="Tokyo Dome" tag="Concert Night" saved />
          </motion.div>
        )}

        {/* Airport */}
        {step >= 6 && (
          <motion.div key={`${cycle}-place5`} {...slideUp}>
            <DemoPlaceCard emoji="✈️" name="Narita Airport" tag="Departure" saved />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
