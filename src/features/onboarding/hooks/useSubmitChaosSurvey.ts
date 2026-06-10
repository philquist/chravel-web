/**
 * useSubmitChaosSurvey — persists a completed diagnostic to `onboarding_responses`.
 *
 * The survey is non-blocking: a failed insert must NOT trap the user on the survey.
 * Callers proceed to the tour regardless; we surface a quiet toast on failure and
 * let Supabase fill `user_id` from auth.uid() (never trust a client-passed id).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ChaosSurveyAnswers } from '../types';

interface SubmitArgs {
  answers: ChaosSurveyAnswers;
  chaosScore: number;
}

/** Row shape inserted into onboarding_responses (user_id is filled server-side). */
interface OnboardingResponseInsert {
  frustration_level: string | null;
  scattered_apps: string[];
  scroll_pain: string | null;
  biggest_chaos: string | null;
  desired_solution: string | null;
  chaos_score: number;
}

async function insertResponse({ answers, chaosScore }: SubmitArgs): Promise<void> {
  const payload: OnboardingResponseInsert = {
    frustration_level: answers.frustration_level,
    scattered_apps: answers.scattered_apps,
    scroll_pain: answers.scroll_pain,
    biggest_chaos: answers.biggest_chaos,
    desired_solution: answers.desired_solution,
    chaos_score: chaosScore,
  };

  // `onboarding_responses` row is owned by the authenticated user; user_id defaults
  // to auth.uid() server-side and RLS enforces auth.uid() = user_id on insert/update.
  // Upsert on user_id: a retake (exit at the result screen, then redo the survey)
  // overwrites the previous response instead of inserting a duplicate row.
  // intentional: onboarding_responses table not yet in generated Supabase types
  // (mirrors the feature_flags pattern in src/lib/featureFlags.ts).
  const { error } = await (supabase as any)
    .from('onboarding_responses')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    throw new Error(error.message);
  }
}

export function useSubmitChaosSurvey() {
  return useMutation({
    // Persist the exact score the user saw on the result screen — never recompute
    // here, so the displayed and stored scores can't drift.
    mutationFn: (args: SubmitArgs) => insertResponse(args),
    onError: (error: unknown) => {
      if (import.meta.env.DEV) {
        console.error('[ChaosSurvey] Failed to save responses:', error);
      }
    },
  });
}
