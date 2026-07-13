/**
 * Contextual home/away/neutral classification for schedule imports.
 *
 * Only surfaces a filter when enough events classify with high confidence.
 * Uncertain rows stay `unknown` and are never silently excluded.
 */

export type HomeAwayNeutral = 'home' | 'away' | 'neutral' | 'unknown';

export interface HomeAwayClassificationInput {
  title: string;
  location?: string | null;
  description?: string | null;
  /** Explicit label from structured source metadata when available */
  explicitLabel?: string | null;
}

export interface HomeAwayClassificationResult {
  classification: HomeAwayNeutral;
  confidence: number;
  reason: string;
}

const EXPLICIT_HOME = /\b(home)\b/i;
const EXPLICIT_AWAY = /\b(away)\b/i;
const EXPLICIT_NEUTRAL = /\b(neutral|neutral.?site|tournament|playoff|finals?|championship)\b/i;

/**
 * Classify a single candidate event. Prefer explicit structured labels;
 * fall back to title/location cues only when unambiguous.
 */
export function classifyHomeAway(input: HomeAwayClassificationInput): HomeAwayClassificationResult {
  const explicit = (input.explicitLabel ?? '').trim().toLowerCase();
  if (explicit === 'home' || explicit === 'h') {
    return { classification: 'home', confidence: 1, reason: 'explicit_label' };
  }
  if (explicit === 'away' || explicit === 'a') {
    return { classification: 'away', confidence: 1, reason: 'explicit_label' };
  }
  if (explicit === 'neutral' || explicit === 'n') {
    return { classification: 'neutral', confidence: 1, reason: 'explicit_label' };
  }

  const haystack = [input.title, input.location ?? '', input.description ?? '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!haystack) {
    return { classification: 'unknown', confidence: 0, reason: 'empty' };
  }

  if (EXPLICIT_NEUTRAL.test(haystack)) {
    return { classification: 'neutral', confidence: 0.75, reason: 'neutral_keyword' };
  }

  // Sports-style matchup cues in the title only.
  // Prefer "@" / "vs" — bare "at" is too common in venue phrases ("Trivia Night at Joe's").
  const atMatch = /(?:^|[\s])@\s+[A-Za-z0-9]/.test(input.title);
  const vsMatch = /\b(?:vs\.?|versus)\s+[A-Za-z0-9]/i.test(input.title);

  if (atMatch && !vsMatch) {
    return { classification: 'away', confidence: 0.85, reason: 'title_at_pattern' };
  }
  if (vsMatch && !atMatch) {
    return { classification: 'home', confidence: 0.85, reason: 'title_vs_pattern' };
  }

  if (EXPLICIT_HOME.test(haystack) && !EXPLICIT_AWAY.test(haystack)) {
    return { classification: 'home', confidence: 0.7, reason: 'home_keyword' };
  }
  if (EXPLICIT_AWAY.test(haystack) && !EXPLICIT_HOME.test(haystack)) {
    return { classification: 'away', confidence: 0.7, reason: 'away_keyword' };
  }

  return { classification: 'unknown', confidence: 0.2, reason: 'ambiguous' };
}

export interface ScheduleHomeAwaySummary {
  /** True when enough events classify confidently to offer filters */
  canOfferFilter: boolean;
  homeCount: number;
  awayCount: number;
  neutralCount: number;
  unknownCount: number;
  classifications: HomeAwayClassificationResult[];
}

const MIN_CLASSIFIED_FOR_FILTER = 3;
const MIN_CONFIDENCE = 0.7;
const MIN_CLASSIFIED_RATIO = 0.4;

/**
 * Summarize classifications for a parse result and decide whether the preview
 * should expose home/away/neutral filters.
 */
export function summarizeHomeAwayClassifications(
  inputs: HomeAwayClassificationInput[],
): ScheduleHomeAwaySummary {
  const classifications = inputs.map(classifyHomeAway);
  let homeCount = 0;
  let awayCount = 0;
  let neutralCount = 0;
  let unknownCount = 0;
  let confidentCount = 0;

  for (const result of classifications) {
    if (result.classification === 'home') homeCount++;
    else if (result.classification === 'away') awayCount++;
    else if (result.classification === 'neutral') neutralCount++;
    else unknownCount++;

    if (
      result.confidence >= MIN_CONFIDENCE &&
      (result.classification === 'home' ||
        result.classification === 'away' ||
        result.classification === 'neutral')
    ) {
      confidentCount++;
    }
  }

  const total = classifications.length;
  const canOfferFilter =
    total >= MIN_CLASSIFIED_FOR_FILTER &&
    confidentCount >= MIN_CLASSIFIED_FOR_FILTER &&
    confidentCount / total >= MIN_CLASSIFIED_RATIO &&
    (homeCount > 0 || awayCount > 0);

  return {
    canOfferFilter,
    homeCount,
    awayCount,
    neutralCount,
    unknownCount,
    classifications,
  };
}
