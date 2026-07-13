/**
 * Dynamic Scaffolding & Socratic control (DSR) — server-owned tutoring policy, not a model decision.
 * Picks the 3-tier Socratic hint level (never skip tiers), sets scaffolding/tone/feedback-timing from
 * mastery + frustration + help-seeking, and detects stuck/avoidant feedback loops across sessions.
 * Sources: RAG-Datasets/tutor-7math-hintsystems.txt (003 gaming, 005 productive struggle, 006 Tier-3
 * cost, 011 metrics); tutor-7math-feedback.txt (001 timing, 002 forward-looking, 003 strategic
 * elaboration, 007 emotional buffer, 008 feedback loops). feedbackLoopType + sessionFlag = flags.MD flag 4.
 */

export type ErrorType = "procedural" | "conceptual";
export type HelpSeeking = "avoidant" | "optimal" | "dependent";
export type FeedbackLoop = "productive" | "stuck" | "avoidant";

export const FRUSTRATION_HIGH = 0.75; // → scaffolding "high", socraticRatio 0.0
export const MIN_ATTEMPTS_BEFORE_HINT = 1; // desirable-difficulties window (hintsystems-005)
export const MAX_ATTEMPTS_BEFORE_FRUSTRATION = 2;
export const STANDARD_DELTA_MAX = 0.15; // normal successful-completion mastery delta
export const TIER3_DELTA_MIN = 0.03; // Tier-3-supported completion delta (hintsystems-006)
export const TIER3_DELTA_MAX = 0.05;
export const MAX_EXCHANGES_PER_STEP = 8; // exceed → frictionMap log (feedback-004)
export const TIER3_OVERUSE_RATIO = 0.3; // Tier-3 > 30% on one concept → prereq remediation
export const CONSECUTIVE_SESSION_FLAG = 3; // stuck/avoidant across 3 sessions → review flag (flag 4)

/** Mastery level below which scaffolding switches from "none" to "faded" mode. */
export const MASTERY_FADED_SCAFFOLDING_THRESHOLD = 0.4;
/** Mastery level above which the tone can shift to analytical (high-mastery challenge mode). */
export const MASTERY_ANALYTICAL_TONE_THRESHOLD = 0.7;
/** Socratic ratio used when scaffolding is in "faded" mode. */
export const SOCRATIC_RATIO_FADED = 0.3;
/** Socratic ratio used when scaffolding is "none" (full Socratic questioning). */
export const SOCRATIC_RATIO_FULL = 1.0;
/** Socratic ratio used when frustration is high (direct instruction replaces questioning). */
export const SOCRATIC_RATIO_DIRECT = 0.0;
/** Minimum Socratic tier — always start here; never skip to a higher tier on the first attempt. */
export const MIN_SOCRATIC_TIER = 1 as const;
/** Maximum Socratic tier — Tier 3 is the worked/bottom-out parallel example. */
export const MAX_SOCRATIC_TIER = 3 as const;

export interface SessionFeedbackSummary {
	loopType: FeedbackLoop;
	repeatedError: boolean;
	engagementDropped: boolean;
}

/**
 * Select the Socratic tier for the current step. Always start at Tier 1; escalate only after the
 * productive-struggle window; never skip tiers. Tier 3 (worked parallel) caps the mastery delta to
 * [TIER3_DELTA_MIN, TIER3_DELTA_MAX].
 */
export function selectSocraticTier(
	current: { tier: 0 | 1 | 2 | 3; attemptsThisStep: number; stuck: boolean },
	signals: {
		masteryProbability: number;
		frustrationIndex: number;
		errorType: ErrorType;
	},
): { tier: 1 | 2 | 3; deliverHint: boolean; masteryDeltaCap: number } {
	// Tier 0 means the problem just started — always open at Tier 1 (never skip)
	const previousTier = current.tier === 0 ? MIN_SOCRATIC_TIER : current.tier;

	// High frustration overrides normal escalation — push toward more support immediately
	if (signals.frustrationIndex >= FRUSTRATION_HIGH) {
		const escalatedTier = Math.min(MAX_SOCRATIC_TIER, previousTier + 1) as
			| 1
			| 2
			| 3;
		const masteryDeltaCap =
			escalatedTier === MAX_SOCRATIC_TIER
				? TIER3_DELTA_MAX
				: STANDARD_DELTA_MAX;
		return { tier: escalatedTier, deliverHint: true, masteryDeltaCap };
	}

	// Student is stuck and has already passed the productive-struggle window — escalate
	if (current.stuck && current.attemptsThisStep > MIN_ATTEMPTS_BEFORE_HINT) {
		const escalatedTier = Math.min(MAX_SOCRATIC_TIER, previousTier + 1) as
			| 1
			| 2
			| 3;
		const masteryDeltaCap =
			escalatedTier === MAX_SOCRATIC_TIER
				? TIER3_DELTA_MAX
				: STANDARD_DELTA_MAX;
		// Deliver a hint only when we have moved above Tier 1
		return {
			tier: escalatedTier,
			deliverHint: escalatedTier > MIN_SOCRATIC_TIER,
			masteryDeltaCap,
		};
	}

	// Too many failed attempts without an explicit stuck flag — still escalate
	if (current.attemptsThisStep > MAX_ATTEMPTS_BEFORE_FRUSTRATION) {
		const escalatedTier = Math.min(MAX_SOCRATIC_TIER, previousTier + 1) as
			| 1
			| 2
			| 3;
		const masteryDeltaCap =
			escalatedTier === MAX_SOCRATIC_TIER
				? TIER3_DELTA_MAX
				: STANDARD_DELTA_MAX;
		return { tier: escalatedTier, deliverHint: true, masteryDeltaCap };
	}

	// Default: stay at Tier 1, no hint — let the productive-struggle window play out
	return {
		tier: MIN_SOCRATIC_TIER,
		deliverHint: false,
		masteryDeltaCap: STANDARD_DELTA_MAX,
	};
}

/**
 * Derive tutoring controls. frustrationIndex ≥ FRUSTRATION_HIGH ⇒ scaffolding "high", socraticRatio 0.0.
 * feedbackTiming: "immediate" for procedural, "delayed" for conceptual confusion (feedback-001).
 * toneOverride set when affective data warrants (feedback-007 emotional buffer).
 */
export function computeScaffoldingAndTone(
	mastery: number,
	frustrationIndex: number,
	helpSeeking: HelpSeeking,
): {
	scaffoldingLevel: "none" | "faded" | "high";
	socraticRatio: number;
	feedbackTiming: "immediate" | "delayed";
	toneOverride?: "encouraging" | "direct" | "analytical";
} {
	// Frustration takes priority — high frustration always triggers maximum scaffolding support
	let scaffoldingLevel: "none" | "faded" | "high";
	let socraticRatio: number;

	if (frustrationIndex >= FRUSTRATION_HIGH) {
		scaffoldingLevel = "high";
		socraticRatio = SOCRATIC_RATIO_DIRECT; // direct instruction replaces questioning
	} else if (mastery < MASTERY_FADED_SCAFFOLDING_THRESHOLD) {
		scaffoldingLevel = "faded";
		socraticRatio = SOCRATIC_RATIO_FADED; // partial guidance with some Socratic questions
	} else {
		scaffoldingLevel = "none";
		socraticRatio = SOCRATIC_RATIO_FULL; // full Socratic mode — questions only
	}

	// Avoidant students need immediate feedback so they do not disengage further (feedback-001)
	const feedbackTiming: "immediate" | "delayed" =
		helpSeeking === "avoidant" ? "immediate" : "delayed";

	// Tone override — set only when affective state calls for a distinct voice
	let toneOverride: "encouraging" | "direct" | "analytical" | undefined;
	if (frustrationIndex >= FRUSTRATION_HIGH) {
		toneOverride = "encouraging"; // emotional buffer for a frustrated student (feedback-007)
	} else if (helpSeeking === "avoidant") {
		toneOverride = "direct"; // avoidant students respond better to clear, direct language
	} else if (mastery > MASTERY_ANALYTICAL_TONE_THRESHOLD) {
		toneOverride = "analytical"; // high-mastery students benefit from deeper analytical engagement
	}

	return {
		scaffoldingLevel,
		socraticRatio,
		feedbackTiming,
		...(toneOverride !== undefined && { toneOverride }),
	};
}

/**
 * Classify the cross-session feedback loop and raise sessionFlag when a stuck/avoidant loop persists
 * across CONSECUTIVE_SESSION_FLAG (3) sessions (feedback-008, flags.MD flag 4). Output feeds the XML
 * delta's motivationalUpdates (feedbackLoopType + sessionFlag).
 */
export function detectStuckLoop(recentSessions: SessionFeedbackSummary[]): {
	loopType: FeedbackLoop;
	sessionFlag: boolean;
} {
	// Not enough session history yet to determine a cross-session pattern
	if (recentSessions.length < CONSECUTIVE_SESSION_FLAG) {
		return { loopType: "productive", sessionFlag: false };
	}

	const lastNSessions = recentSessions.slice(-CONSECUTIVE_SESSION_FLAG);

	// Unanimous stuck pattern across the required window — raise the session flag (flags.MD flag 4)
	const allSessionsAreStuck    = lastNSessions.every(session => session.loopType === "stuck");
	const allSessionsAreAvoidant = lastNSessions.every(session => session.loopType === "avoidant");

	if (allSessionsAreStuck)    return { loopType: "stuck",    sessionFlag: true };
	if (allSessionsAreAvoidant) return { loopType: "avoidant", sessionFlag: true };

	// Majority vote — dominant pattern present but not yet flagged
	const stuckSessionCount    = lastNSessions.filter(session => session.loopType === "stuck").length;
	const avoidantSessionCount = lastNSessions.filter(session => session.loopType === "avoidant").length;

	if (stuckSessionCount    > avoidantSessionCount) return { loopType: "stuck",    sessionFlag: false };
	if (avoidantSessionCount > stuckSessionCount)    return { loopType: "avoidant", sessionFlag: false };

	return { loopType: "productive", sessionFlag: false };
}
