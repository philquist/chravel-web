/**
 * TripChaosDiagnostic — the "trip chaos diagnostic" survey shown before the product
 * tour for new users. Five fast questions → a chaos score → hand-off to the tour,
 * personalized to the screen that solves the user's stated biggest pain.
 *
 * Non-blocking by design: a failed save still lets the user continue to the tour.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { hapticService as haptics } from '@/services/hapticService';
import { useChaosSurvey } from '../hooks/useChaosSurvey';
import { useSubmitChaosSurvey } from '../hooks/useSubmitChaosSurvey';
import { painToScreen } from '../lib/painToScreen';
import { SurveyQuestionScreen } from './SurveyQuestionScreen';
import { SurveyResultScreen } from './SurveyResultScreen';

interface TripChaosDiagnosticProps {
  /** Called when the survey is done; `personalizedScreen` is the tour screen to open on. */
  onComplete: (personalizedScreen: number | null) => void;
  /** Called when the user skips the survey (no personalization). */
  onSkip: () => void;
}

const slideVariants = {
  enter: { x: 60, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -60, opacity: 0 },
};

export const TripChaosDiagnostic = ({ onComplete, onSkip }: TripChaosDiagnosticProps) => {
  const {
    step,
    totalQuestions,
    currentQuestion,
    isResultStep,
    answers,
    chaosScore,
    isCurrentAnswered,
    setSingleAnswer,
    toggleScatteredApp,
    goNext,
    goPrev,
  } = useChaosSurvey();

  const { toast } = useToast();
  const submitSurvey = useSubmitChaosSurvey();
  const hasSubmitted = useRef(false);

  // Submit exactly once when the user reaches the result step. The survey is
  // non-blocking — on failure we surface a quiet toast but never trap the user.
  useEffect(() => {
    if (!isResultStep || hasSubmitted.current) return;
    hasSubmitted.current = true;
    submitSurvey.mutate(
      { answers, chaosScore },
      {
        onError: () => {
          toast({
            title: "Couldn't save your answers",
            description: 'No worries — you can keep going. We just lost this one.',
          });
        },
      },
    );
  }, [isResultStep, answers, chaosScore, submitSurvey, toast]);

  const handleNext = useCallback(() => {
    if (!isCurrentAnswered) return;
    haptics.light();
    goNext();
  }, [isCurrentAnswered, goNext]);

  const handlePrev = useCallback(() => {
    haptics.light();
    goPrev();
  }, [goPrev]);

  const handleSkip = useCallback(() => {
    haptics.medium();
    onSkip();
  }, [onSkip]);

  const handleShowDemo = useCallback(() => {
    haptics.success();
    onComplete(painToScreen(answers.biggest_chaos));
  }, [onComplete, answers.biggest_chaos]);

  // Escape exits the survey, mirroring the carousel's keyboard escape hatch.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSkip]);

  // Question step is 1-indexed for display; result step shows a full bar.
  const progressValue = isResultStep ? 100 : Math.round(((step + 1) / (totalQuestions + 1)) * 100);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Trip chaos diagnostic"
    >
      {/* Header: progress + skip */}
      <div className="flex items-center gap-4 px-4 pt-5 pb-2 max-w-md w-full mx-auto">
        <Progress value={progressValue} className="h-1.5 flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkip}
          className="text-muted-foreground shrink-0"
          aria-label="Skip survey"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="absolute inset-0 flex flex-col justify-center px-6 py-4 overflow-y-auto"
          >
            {isResultStep || !currentQuestion ? (
              <SurveyResultScreen chaosScore={chaosScore} onShowDemo={handleShowDemo} />
            ) : (
              <SurveyQuestionScreen
                question={currentQuestion}
                answers={answers}
                onSelectSingle={setSingleAnswer}
                onToggleMulti={toggleScatteredApp}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav (questions only — result screen has its own CTA) */}
      {!isResultStep && (
        <div className="p-6 pb-8">
          <div className="flex items-center gap-3 w-full max-w-md mx-auto">
            {step > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                className="shrink-0"
                aria-label="Previous question"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <Button
              size="default"
              className="flex-1"
              onClick={handleNext}
              disabled={!isCurrentAnswered}
            >
              {step === totalQuestions - 1 ? 'See my score' : 'Continue'}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
