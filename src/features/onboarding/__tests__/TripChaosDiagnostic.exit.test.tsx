import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TripChaosDiagnostic } from '../components/TripChaosDiagnostic';
import { CHAOS_QUESTIONS } from '../lib/questions';
import type { ChaosSurveyAnswers } from '../types';

vi.mock('@/services/hapticService', () => ({
  hapticService: {
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mutateMock = vi.fn();
vi.mock('../hooks/useSubmitChaosSurvey', () => ({
  useSubmitChaosSurvey: () => ({ mutate: mutateMock }),
}));

const EMPTY_ANSWERS: ChaosSurveyAnswers = {
  frustration_level: null,
  scattered_apps: [],
  scroll_pain: null,
  biggest_chaos: null,
  desired_solution: null,
};

// Controllable stand-in for the survey state machine so tests can pin the flow
// to a specific step (first question, middle question, result) without clicking
// through Radix radio groups.
const surveyState = {
  step: 0,
  totalQuestions: CHAOS_QUESTIONS.length,
  currentQuestion: CHAOS_QUESTIONS[0] as (typeof CHAOS_QUESTIONS)[number] | null,
  isResultStep: false,
  answers: EMPTY_ANSWERS,
  chaosScore: 0,
  isCurrentAnswered: false,
  setSingleAnswer: vi.fn(),
  toggleScatteredApp: vi.fn(),
  goNext: vi.fn(),
  goPrev: vi.fn(),
};

vi.mock('../hooks/useChaosSurvey', () => ({
  useChaosSurvey: () => surveyState,
}));

const setStep = (step: number) => {
  const isResultStep = step >= CHAOS_QUESTIONS.length;
  surveyState.step = step;
  surveyState.isResultStep = isResultStep;
  surveyState.currentQuestion = isResultStep ? null : CHAOS_QUESTIONS[step];
};

const renderSurvey = () => {
  const onComplete = vi.fn();
  const onSkip = vi.fn();
  render(<TripChaosDiagnostic onComplete={onComplete} onSkip={onSkip} />);
  return { onComplete, onSkip };
};

describe('TripChaosDiagnostic exit affordances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStep(0);
  });

  it.each([
    ['first question', 0],
    ['middle question', 2],
    ['final question', CHAOS_QUESTIONS.length - 1],
    ['result screen', CHAOS_QUESTIONS.length],
  ])('exposes a clickable skip button on the %s', async (_label, step) => {
    setStep(step);
    const { onSkip } = renderSurvey();

    const skipButton = screen.getByRole('button', { name: 'Skip survey' });
    await userEvent.click(skipButton);

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('exits on Escape, mirroring the carousel escape hatch', () => {
    const { onSkip } = renderSurvey();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('removes the Escape listener on unmount', () => {
    const onSkip = vi.fn();
    const { unmount } = render(<TripChaosDiagnostic onComplete={vi.fn()} onSkip={onSkip} />);

    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onSkip).not.toHaveBeenCalled();
  });
});
