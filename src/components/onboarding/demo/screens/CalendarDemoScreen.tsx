/**
 * Calendar Demo Screen — Itinerary timeline with shared group visibility
 *
 * ~6s loop: Day header → 5 events → shared badge → reset
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoDayHeader, DemoTimelineEvent } from '../primitives';
import { motion as motionPreset, LOOP_DURATION } from '../tokens';
import { Users } from 'lucide-react';

const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: motionPreset.slideIn,
};

export const CalendarDemoScreen = () => {
  const [cycle, setCycle] = useState(0);
  const [step, setStep] = useState(0);

  const resetAndLoop = useCallback(() => {
    setStep(0);
    setCycle(c => c + 1);
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400), // day header
      setTimeout(() => setStep(2), 1000), // event 1
      setTimeout(() => setStep(3), 1700), // event 2
      setTimeout(() => setStep(4), 2400), // event 3
      setTimeout(() => setStep(5), 3100), // event 4
      setTimeout(() => setStep(6), 3800), // event 5
      setTimeout(() => setStep(7), 4600), // shared badge
      setTimeout(resetAndLoop, LOOP_DURATION * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [cycle, resetAndLoop]);

  return (
    <div className="flex flex-col h-full px-3 py-3 gap-2">
      <AnimatePresence>
        {/* Day header */}
        {step >= 1 && (
          <motion.div key={`${cycle}-day`} {...slideUp}>
            <DemoDayHeader day={1} date="Friday, June 3" />
          </motion.div>
        )}

        {/* Event 1 */}
        {step >= 2 && (
          <motion.div key={`${cycle}-ev1`} {...slideUp}>
            <DemoTimelineEvent
              emoji="🍽️"
              title="Dinner Reservation"
              category="dining"
              categoryLabel="Dining"
              time="7:30 PM"
              location="Sushi Saito"
            />
          </motion.div>
        )}

        {/* Event 2 */}
        {step >= 3 && (
          <motion.div key={`${cycle}-ev2`} {...slideUp}>
            <DemoTimelineEvent
              emoji="🎯"
              title="Museum Visit"
              category="activity"
              categoryLabel="Activity"
              time="10:00 AM"
              location="National Art Museum"
            />
          </motion.div>
        )}

        {/* Event 3 */}
        {step >= 4 && (
          <motion.div key={`${cycle}-ev3`} {...slideUp}>
            <DemoTimelineEvent
              emoji="🚕"
              title="Airport Pickup"
              category="activity"
              categoryLabel="Transport"
              time="3:00 PM"
              location="Narita Terminal 2"
            />
          </motion.div>
        )}

        {/* Event 4 */}
        {step >= 5 && (
          <motion.div key={`${cycle}-ev4`} {...slideUp}>
            <DemoTimelineEvent
              emoji="🎭"
              title="Broadway Show"
              category="activity"
              categoryLabel="Show"
              time="8:00 PM"
              location="Lyric Theatre"
            />
          </motion.div>
        )}

        {/* Event 5 */}
        {step >= 6 && (
          <motion.div key={`${cycle}-ev5`} {...slideUp}>
            <DemoTimelineEvent
              emoji="🏖️"
              title="Free Afternoon"
              category="activity"
              categoryLabel="Free Time"
              time="2:00 PM"
              location="Beachfront"
            />
          </motion.div>
        )}

        {/* Shared indicator */}
        {step >= 7 && (
          <motion.div
            key={`${cycle}-shared`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={motionPreset.slideIn}
            className="flex items-center gap-1.5 px-1 ml-5"
          >
            <Users className="w-3 h-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Shared with 4 Chravelers</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

CalendarDemoScreen.title = "Plans that don't drift.";
CalendarDemoScreen.subtitle = 'Shared itinerary. Everyone sees the plan.';
