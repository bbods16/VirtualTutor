/**
 * Free Spaced Repetition Scheduling (long-term retention layer — kept separate from BKT, which is the
 * in-session inference layer). Retrievability decays with time-since-practice; when it falls below the
 * review threshold the skill is interleaved for retrieval practice.
 * Sources: RAG-Datasets/tutor-7math-studentmodeling.txt (004 forgetting); tutor-7math-cognition.txt
 * (006 spaced retrieval / consolidation).
 */

import type { KcTier } from "../BKT/BayesianKnowledgeTracing.ts";

export interface FsrsMemoryState {
  stability: number; difficulty: number;
  lastReviewDate: Date; masteryProbability: number; kcTier: KcTier;
}
export interface ReviewOutcome { correct: boolean; reviewedAt: Date; }

/** Per-tier forgetting rate F (studentmodeling-004): P_adj = P * exp(-F * daysSinceLastPractice). */
export const FORGETTING_RATE: Record<KcTier, number> = {
  identification: 0.02, interpretation: 0.03, translation: 0.04, application: 0.05,
};
export const FORGETTING_GRACE_DAYS = 7;           // apply discount only when gap > 7 days
export const RETRIEVAL_PRIORITY_THRESHOLD = 0.65; // adjusted posterior below this → session-opening retrieval
export const DUE_THRESHOLD = 0.65;                // retrievability below this → due for review

/** Milliseconds in one calendar day — converts Date difference to fractional days. */
export const MS_PER_DAY = 86_400_000;
/** Growth factor used in stability update after a correct review. */
export const STABILITY_GROWTH_FACTOR = 0.2;
/** Minimum stability value — prevents collapse to zero after repeated failures. */
export const MIN_STABILITY = 0.1;
/** How much difficulty decreases after a correct review. */
export const DIFFICULTY_CORRECT_DECREMENT = 0.05;
/** How much difficulty increases after an incorrect review. */
export const DIFFICULTY_INCORRECT_INCREMENT = 0.1;
/** Minimum difficulty — keeps denominator of stability growth formula non-zero. */
export const MIN_DIFFICULTY = 0.1;
/** Maximum difficulty — hard cap. */
export const MAX_DIFFICULTY = 1.0;
/** How much mastery probability is credited after a correct review. */
export const MASTERY_CORRECT_INCREMENT = 0.05;
/** How much mastery probability is penalised after an incorrect review. */
export const MASTERY_INCORRECT_DECREMENT = 0.10;
/** Stability multiplier applied on an incorrect review (partial forgetting). */
export const STABILITY_INCORRECT_MULTIPLIER = 0.5;

/** Current retrievability R(t) ∈ [0,1] from elapsed time and stored stability/forgetting state. */
export function computeRetrievability(state: FsrsMemoryState, now: Date): number {
  const elapsedMilliseconds = now.getTime() - state.lastReviewDate.getTime();
  const daysSinceLastReview = elapsedMilliseconds / MS_PER_DAY;

  // Within the grace period, full retrievability — no forgetting discount applied
  if (daysSinceLastReview <= FORGETTING_GRACE_DAYS) return 1.0;

  const forgettingRateForTier = FORGETTING_RATE[state.kcTier];

  // Exponential forgetting curve: R(t) = mastery × exp(−forgettingRate × daysSince)
  const rawRetrievability = state.masteryProbability * Math.exp(-forgettingRateForTier * daysSinceLastReview);

  return Math.max(0, Math.min(1, rawRetrievability));
}

/** Update stability & difficulty after a review outcome; stamp lastReviewDate. */
export function computeFsrsState(state: FsrsMemoryState, review: ReviewOutcome): FsrsMemoryState {
  let updatedStability    = state.stability;
  let updatedDifficulty   = state.difficulty;
  let updatedMastery      = state.masteryProbability;

  if (review.correct) {
    // Correct review: stability grows faster for easier material; mastery and ease improve
    updatedStability  = updatedStability * (1 + STABILITY_GROWTH_FACTOR / Math.max(MIN_DIFFICULTY, updatedDifficulty));
    updatedDifficulty = Math.max(MIN_DIFFICULTY, updatedDifficulty - DIFFICULTY_CORRECT_DECREMENT);
    updatedMastery    = Math.min(1, updatedMastery + MASTERY_CORRECT_INCREMENT);
  } else {
    // Incorrect review: stability halves, difficulty increases, mastery is penalised
    updatedStability  = updatedStability * STABILITY_INCORRECT_MULTIPLIER;
    updatedDifficulty = Math.min(MAX_DIFFICULTY, updatedDifficulty + DIFFICULTY_INCORRECT_INCREMENT);
    updatedMastery    = Math.max(0, updatedMastery - MASTERY_INCORRECT_DECREMENT);
  }

  return {
    stability:         Math.max(MIN_STABILITY, updatedStability),
    difficulty:        updatedDifficulty,
    lastReviewDate:    review.reviewedAt,
    masteryProbability: updatedMastery,
    kcTier:            state.kcTier,
  };
}

/** True when computeRetrievability(state, now) < DUE_THRESHOLD. */
export function isDueForReview(state: FsrsMemoryState, now: Date): boolean {
  const currentRetrievability = computeRetrievability(state, now);
  return currentRetrievability < DUE_THRESHOLD;
}
