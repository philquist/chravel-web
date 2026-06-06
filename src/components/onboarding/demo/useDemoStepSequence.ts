import { useCallback, useEffect, useRef, useState } from 'react';
import { LOOP_DURATION } from './tokens';

/**
 * Drives the shared onboarding demo animation loop.
 *
 * Advances `step` from 1..N at the given millisecond offsets (`stepDelays[i]` is the delay before
 * `step` becomes `i + 1`), then resets to 0 and bumps `cycle` at LOOP_DURATION. `cycle` is meant to
 * be used as a key suffix so AnimatePresence re-runs enter animations on each loop.
 *
 * Centralizes the timer-ladder + cleanup boilerplate that was duplicated across every demo screen.
 */
export function useDemoStepSequence(stepDelays: number[]): { step: number; cycle: number } {
  const [cycle, setCycle] = useState(0);
  const [step, setStep] = useState(0);

  // Hold the latest delays without making them an effect dependency — callers pass a fresh array
  // literal each render and we don't want to restart the loop on array identity changes.
  const delaysRef = useRef(stepDelays);
  delaysRef.current = stepDelays;

  const resetAndLoop = useCallback(() => {
    setStep(0);
    setCycle(c => c + 1);
  }, []);

  useEffect(() => {
    const timers = delaysRef.current.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    timers.push(setTimeout(resetAndLoop, LOOP_DURATION * 1000));
    return () => timers.forEach(clearTimeout);
  }, [cycle, resetAndLoop]);

  return { step, cycle };
}
