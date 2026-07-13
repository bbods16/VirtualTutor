/**
 * Bayesian Knowledge Tracing (BKT) — Corbett & Anderson 1994.
 * Models each Knowledge Component as a latent binary "known/not-known" state and updates the posterior
 * P(L) after every scored response. Mastery (P(L)) drives progression gating and hint specificity.
 * Sources: RAG-Datasets/tutor-7math-studentmodeling.txt (001 theory, 002 calibration, 003 thresholds,
 * 004 forgetting, 006 affect, 008 individual variation); tutor-7math-hintsystems.txt (006 bottom-out,
 * 007 mastery gating, 008 the 16 KCs). Prereq gate = flags.MD flag 1; KC tracking = flag 3.
 */

export type KcTier =
	| "identification"
	| "interpretation"
	| "translation"
	| "application";
export type AffectState = "engaged" | "confused" | "frustrated" | "bored";

export interface BktParams {
	L0: number;
	T: number;
	G: number;
	S: number;
}
export interface BktSkillState {
	masteryProbability: number;
	slipRate: number;
	guessRate: number;
	successes: number;
	failures: number; // PFA-style supplementary counts (studentmodeling-005)
}

/** Population-calibrated starting parameters by KC category (studentmodeling-002). */
export const BKT_PARAMS: Record<KcTier, BktParams> = {
	identification: { L0: 0.1, T: 0.2, G: 0.25, S: 0.1 }, // KC-01, KC-02
	interpretation: { L0: 0.05, T: 0.15, G: 0.15, S: 0.12 }, // KC-03, KC-04
	translation: { L0: 0.08, T: 0.12, G: 0.2, S: 0.15 }, // KC-10, KC-12
	application: { L0: 0.12, T: 0.1, G: 0.1, S: 0.18 }, // KC-13, KC-14, KC-16
};

/** Tier-3 (worked-parallel / bottom-out) inflated slip & guess — discounts hint-supported correctness
 *  so it takes more hint-supported wins to reach mastery (studentmodeling-003, hintsystems-006). */
export const TIER3_INFLATED: Pick<BktParams, "S" | "G"> = { S: 0.3, G: 0.4 };

/** Floating-point degeneracy clamps (studentmodeling-001 warning). */
export const CLAMP_MIN = 0.0001;
export const CLAMP_MAX = 0.9999;

/** Multiplier applied to slip/guess rate when an affect state warrants adjustment (studentmodeling-006). */
export const AFFECT_ADJUSTMENT_MULTIPLIER = 1.2;
/** Upper bound on slip/guess rate after affect adjustment — prevents degenerate extremes. */
export const AFFECT_RATE_CAP = 0.5;
/** Number of extra consecutive-opportunity credits required when mastery is Tier-3-supported. */
export const TIER3_MASTERY_EXTRA_CONSECUTIVE = 1;

/** Mastery thresholds (studentmodeling-003, hintsystems-007). */
export const THRESHOLD_FOUNDATIONAL = 0.8; // KC-01..KC-05
export const THRESHOLD_DEPENDENT = 0.75; // KC-06..KC-16
export const CONSECUTIVE_OPPORTUNITIES = 3; // must hold across ≥3 consecutive opportunities
export const STABILITY_SESSIONS = 2; // and across ≥2 separate sessions

/**
 * Update the BKT posterior for one scored observation, then apply the learning transition.
 *   evidence-correct:   P*(1-S)          / [ P*(1-S)        + (1-P)*G     ]
 *   evidence-incorrect: P*S              / [ P*S            + (1-P)*(1-G) ]
 *   learning:           P_new = posterior + (1 - posterior) * T
 *   clamp to [CLAMP_MIN, CLAMP_MAX].
 * Use TIER3_INFLATED when observation.hintTier === 3; apply affect-adjusted G/S per studentmodeling-006.
 */
export function computeBktUpdate(
	prior: BktSkillState,
	observation: {
		correct: boolean;
		hintTier: 0 | 1 | 2 | 3;
		affect?: AffectState;
	},
	params: BktParams,
): BktSkillState {
	// Use Tier-3 inflated rates when a worked/bottom-out hint was delivered (discounts hint-supported wins)
	let effectiveSlipRate =
		observation.hintTier === 3 ? TIER3_INFLATED.S : params.S;
	let effectiveGuessRate =
		observation.hintTier === 3 ? TIER3_INFLATED.G : params.G;

	// Affect adjustments (studentmodeling-006):
	//   frustrated students make more execution errors → inflate slip rate
	//   bored students are more likely to guess → inflate guess rate
	if (observation.affect === "frustrated") {
		effectiveSlipRate = Math.min(
			effectiveSlipRate * AFFECT_ADJUSTMENT_MULTIPLIER,
			AFFECT_RATE_CAP,
		);
	}
	if (observation.affect === "bored") {
		effectiveGuessRate = Math.min(
			effectiveGuessRate * AFFECT_ADJUSTMENT_MULTIPLIER,
			AFFECT_RATE_CAP,
		);
	}

	const priorMastery = prior.masteryProbability;
	const learningRate = params.T;

	// Bayesian evidence update:
	//   correct:   posterior = P(L) * (1 - P(S))  / [P(L) * (1 - P(S)) + (1 - P(L)) * P(G)]
	//   incorrect: posterior = P(L) * P(S)         / [P(L) * P(S)        + (1 - P(L)) * (1 - P(G))]
	const posteriorMastery = observation.correct
		? (priorMastery * (1 - effectiveSlipRate)) /
			(priorMastery * (1 - effectiveSlipRate) +
				(1 - priorMastery) * effectiveGuessRate)
		: (priorMastery * effectiveSlipRate) /
			(priorMastery * effectiveSlipRate +
				(1 - priorMastery) * (1 - effectiveGuessRate));

	// Learning transition: P_new = posterior + (1 - posterior) * T
	// (the student may have learned from the attempt regardless of whether they answered correctly)
	const updatedMastery =
		posteriorMastery + (1 - posteriorMastery) * learningRate;

	return {
		masteryProbability: Math.max(
			CLAMP_MIN,
			Math.min(updatedMastery, CLAMP_MAX),
		),
		slipRate: effectiveSlipRate,
		guessRate: effectiveGuessRate,
		successes: prior.successes + (observation.correct ? 1 : 0),
		failures: prior.failures + (observation.correct ? 0 : 1),
	};
}

/**
 * Decide whether a KC has reached mastery and whether its progression gate may open.
 * Foundational KCs use THRESHOLD_FOUNDATIONAL (0.80); dependent/application use THRESHOLD_DEPENDENT (0.75).
 * Gate opens only if mastery ≥ threshold AND consecutiveAtMastery ≥ CONSECUTIVE_OPPORTUNITIES
 * AND sessionsAboveThreshold ≥ STABILITY_SESSIONS. Tier-3-supported mastery counts for less.
 */
export function computeMasteryThreshold(
	skill: BktSkillState,
	kcTier: KcTier,
	history: {
		consecutiveAtMastery: number;
		sessionsAboveThreshold: number;
		tier3Supported: boolean;
	},
): { mastered: boolean; gateOpen: boolean; thresholdUsed: number } {
	// Foundational KCs (identification/interpretation) need the higher 0.80 threshold
	// before dependent KCs can be unlocked (flags.MD flag 1, hintsystems-007)
	const isFoundationalKc =
		kcTier === "identification" || kcTier === "interpretation";
	const thresholdUsed = isFoundationalKc
		? THRESHOLD_FOUNDATIONAL
		: THRESHOLD_DEPENDENT;

	const mastered = skill.masteryProbability >= thresholdUsed;

	// Tier-3-supported mastery is weaker evidence — require one extra consecutive opportunity
	const requiredConsecutiveOpportunities = history.tier3Supported
		? CONSECUTIVE_OPPORTUNITIES + TIER3_MASTERY_EXTRA_CONSECUTIVE
		: CONSECUTIVE_OPPORTUNITIES;

	// Gate opens only when mastery is stable across both consecutive turns AND separate sessions
	const gateOpen =
		mastered &&
		history.consecutiveAtMastery >= requiredConsecutiveOpportunities &&
		history.sessionsAboveThreshold >= STABILITY_SESSIONS;

	return { mastered, gateOpen, thresholdUsed };
}
