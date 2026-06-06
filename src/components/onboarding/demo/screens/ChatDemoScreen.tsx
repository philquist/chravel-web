/**
 * Chat Demo Screen — Chravel-authentic chat with segmented control
 *
 * ~6s loop: Messages mode → 4 messages (multiple voices) → switch to Broadcasts
 *         → 4 admin-style broadcasts → reaction → reset
 */

import { motion, AnimatePresence } from 'framer-motion';
import { DemoBubble, DemoSegmentedControl } from '../primitives';
import { motion as motionPreset } from '../tokens';
import { useDemoStepSequence } from '../useDemoStepSequence';

const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: motionPreset.slideIn,
};

// Switch to the Broadcasts tab at this step.
const BROADCAST_STEP = 5;

export const ChatDemoScreen = () => {
  // Steps: 1-4 messages (Alex / you / Maya / you), 5 switch to Broadcasts, 6-9 broadcasts.
  const { step, cycle } = useDemoStepSequence([
    400, 1000, 1500, 2000, 2600, 2900, 3400, 3900, 4400,
  ]);

  const segmentMode = step >= BROADCAST_STEP ? 'broadcasts' : 'messages';
  const inMessages = step >= 1 && step < BROADCAST_STEP;

  return (
    <div className="flex flex-col h-full">
      {/* Segmented control */}
      <div className="px-3 py-2">
        <DemoSegmentedControl active={segmentMode} />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col px-3 py-2 justify-end gap-1.5 overflow-hidden">
        <AnimatePresence mode="sync">
          {/* ── Messages mode ── */}
          {inMessages && step >= 1 && (
            <motion.div key={`${cycle}-msg1`} {...slideUp} className="flex flex-col">
              <DemoBubble
                variant="other"
                sender="Alex"
                text="Found an amazing sushi spot near the hotel 🍣"
                avatar={{ initial: 'A', color: 'bg-blue-500' }}
              />
            </motion.div>
          )}

          {inMessages && step >= 2 && (
            <motion.div key={`${cycle}-msg2`} {...slideUp} className="flex flex-col">
              <DemoBubble variant="own" text="We're down! Let's lock it in 🙌" />
            </motion.div>
          )}

          {inMessages && step >= 3 && (
            <motion.div key={`${cycle}-msg3`} {...slideUp} className="flex flex-col">
              <DemoBubble
                variant="other"
                sender="Maya"
                text="I'll book a table for 6 at 8 👀"
                avatar={{ initial: 'M', color: 'bg-pink-500' }}
              />
            </motion.div>
          )}

          {inMessages && step >= 4 && (
            <motion.div key={`${cycle}-msg4`} {...slideUp} className="flex flex-col">
              <DemoBubble variant="own" text="Perfect — adding it to the calendar 📅" />
            </motion.div>
          )}

          {/* ── Broadcasts mode ── */}
          {step >= 6 && (
            <motion.div key={`${cycle}-bc1`} {...slideUp} className="flex flex-col relative">
              <DemoBubble
                variant="broadcast"
                text="✈️ Flight lands 3:15 PM — meet at baggage claim 4"
                showBroadcastLabel
              />
              {step >= 9 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={motionPreset.micro}
                  className="self-start ml-2 mt-1 text-sm"
                >
                  🔥
                </motion.span>
              )}
            </motion.div>
          )}

          {step >= 7 && (
            <motion.div key={`${cycle}-bc2`} {...slideUp} className="flex flex-col">
              <DemoBubble variant="broadcast" text="Dinner moved to 8:00 PM at Sushi Saito" />
            </motion.div>
          )}

          {step >= 8 && (
            <motion.div key={`${cycle}-bc3`} {...slideUp} className="flex flex-col">
              <DemoBubble variant="broadcast" text="Reminder: passports & e-visas due tonight" />
            </motion.div>
          )}

          {step >= 9 && (
            <motion.div key={`${cycle}-bc4`} {...slideUp} className="flex flex-col">
              <DemoBubble
                variant="broadcast"
                text="Hotel check-in is at the 12th-floor sky lobby"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

ChatDemoScreen.title = 'One trip. One chat.';
ChatDemoScreen.subtitle = 'Messages, broadcasts, and reactions — all in your trip.';
