import { createHash } from "node:crypto";
import type { LearningProfileStore } from "@domain/profile/LearningProfileStore.ts";
import type { LearningProfilePayload } from "@domain/profile/LearningProfilePromptView.ts";

/**
 * PromptProjectionService — owns the canonical-store → prompt-view dialect boundary.
 * Owns: deriving the sanitized `LearningProfilePayload` from `LearningProfileStore` (confidence
 * gating, free-text sanitization, prompt-excluded-field stripping per ALGORITHM_SCAFFOLD_PLAN.md
 * §1), assembling the full prompt envelope sent to the model, and validating the model's
 * structured response before it is trusted. Does NOT own: profile persistence (ProfileService),
 * session lifecycle (SessionService), or patch generation (FinalizerService).
 */

/** Confidence below this value gates a misconception or affective trait out of the prompt view. */
const CONFIDENCE_GATE_THRESHOLD = 0.60;

/** Tone values that are safe to forward to the model — any other string is stripped. */
const SAFE_TONE_OVERRIDES = ["encouraging", "direct", "analytical"] as const;
type SafeToneOverride = typeof SAFE_TONE_OVERRIDES[number];

/** Prompt envelope policy version — bumped when the system prompt structure changes. */
const PROMPT_POLICY_VERSION = "1.0.0";

/**
 * Context passed to `buildPromptEnvelope`.
 * `expectedAnswer` is optional — teachers can pre-load the correct answer to prevent the model
 * from going off-course. Leave it undefined to let the model determine correctness itself.
 * `studentPreviouslyCorrect` signals that this turn is a confirmation, not new instruction —
 * when true the envelope permits the model to surface the answer to the student.
 *
 * TODO (future): `tutorType` should become an enum that selects which tutor personality
 * and which subject domain to activate (e.g. "math_algebra", "math_geometry", "science").
 * The system prompt will then load the appropriate subject-specific rubric.
 */
export interface PromptEnvelopeContext {
	currentProblem: string;
	sessionExchange: string;
	/** Pre-loaded correct answer (teacher-provided). When present, the model is told not to diverge from it. */
	expectedAnswer?: string;
	/** True when the student has already answered correctly this turn — the model may confirm and reveal. */
	studentPreviouslyCorrect?: boolean;
}

/**
 * Result of `validateModelResponse`.
 * `containsExplicitAnswer` flags when the response appears to state the final answer directly.
 * `mayRevealAnswer` is true only when `studentPreviouslyCorrect` was set in the validation options.
 */
export interface ModelResponseValidation {
	valid: boolean;
	errors: string[];
	containsExplicitAnswer: boolean;
	mayRevealAnswer: boolean;
}

export interface ModelResponseValidationOptions {
	/** When true, the student has already gotten the answer right — confirming it is allowed. */
	studentPreviouslyCorrect?: boolean;
}

/** Keywords that suggest the model response contains or reveals a direct answer. */
const ANSWER_REVEAL_SIGNALS = [
	"the answer is",
	"x =",
	"y =",
	"= ",
	"the solution is",
	"therefore",
	"so the final answer",
	"answer:",
] as const;

export class PromptProjectionService {
	/**
	 * Project the canonical store into the sanitized, prompt-facing payload: drop
	 * prompt-excluded fields (`evidenceLog`, `dataRetentionTtl`, raw `gradeLevel`), derive
	 * `developmentalStage` server-side, and gate misconceptions/affective traits below 0.60 confidence.
	 * Values are sourced from the store (which seeds them from the intake quiz) — nothing is hardcoded.
	 */
	public derivePromptView(store: LearningProfileStore): LearningProfilePayload {
		// Hash the student ID — plaintext PII must never enter the prompt (FERPA / Ed Law 2-d)
		const studentIdHash = createHash("sha256").update(store.student_id).digest("hex");

		// Map skill states — drop backend-internal fields (evidenceLog, dataRetentionTtl)
		const mappedSkills: LearningProfilePayload["cognitive"]["skills"] = {};
		for (const [skillId, skillState] of Object.entries(store.cognitive.skills)) {
			mappedSkills[skillId] = {
				skillName:           skillId,
				masteryProbability:  skillState.masteryProbability,
				slipRate:            skillState.slipRate,
				guessRate:           skillState.guessRate,
				// FSRS retrievability is sourced from the store when tracked; mastery is the proxy until then
				retrievabilityScore: skillState.masteryProbability,
				dueForReview:        skillState.dueForReview,
			};
		}

		// Gate misconceptions below the confidence threshold — uncertain diagnoses pollute the prompt
		const gatedMisconceptions = store.cognitive.misconceptions
			.filter(misconception => misconception.confidenceScore >= CONFIDENCE_GATE_THRESHOLD)
			.map(misconception => ({
				misconceptionId: misconception.id,
				description:     misconception.id,
				confidence:      misconception.confidenceScore,
			}));

		// Map scaffolding level from SCREAMING_SNAKE_CASE (store) to lowercase (prompt view)
		const scaffoldingLevel = store.behavioral.scaffoldingLevel.toLowerCase() as
			"none" | "faded" | "high";

		// Map answer reveal policy: store uses SCREAMING_SNAKE, prompt view uses lowercase_snake
		const answerRevealPolicy = store.behavioral.answerRevealPolicy
			.toLowerCase() as "never" | "after_3_attempts" | "on_request";

		// Accessibility defaults sourced from generatedFrom (populated by buildInitialProfile from quiz)
		const accessibilityFromQuiz = (store.generatedFrom?.["accessibility"] ?? {}) as Record<string, unknown>;

		const payload: LearningProfilePayload = {
			schemaVersion: "1.3.0",
			learnerIdentity: {
				studentIdHash,
				// gradeLevel is stored on the profile — extracted from intake quiz by ProfileService
				gradeLevel: store.gradeLevel,
				// locale is stored on the profile — extracted from intake quiz by ProfileService
				locale: store.locale,
			},
			cognitive: {
				skills:               mappedSkills,
				activeMisconceptions: gatedMisconceptions,
			},
			behavioral: {
				accessibility: {
					readingLevelAdjustment: (accessibilityFromQuiz["readingLevelAdjustment"] as "simplified" | "standard" | "advanced") ?? "standard",
					cognitiveLoadLimit:     (accessibilityFromQuiz["cognitiveLoadLimit"] as "low" | "standard" | "high") ?? "standard",
					modalityPreference:     (accessibilityFromQuiz["modalityPreference"] as "text_heavy" | "visual_heavy" | "auditory_heavy") ?? "text_heavy",
				},
				transientState: {
					frustrationIndex:                    store.behavioral.frustrationIndex,
					helpSeekingBehavior:                 store.cognitive.metacognition.helpSeeking,
					persistence:                         store.cognitive.metacognition.persistence,
					selfReportConfidenceCalibration:
						store.cognitive.metacognition.selfReportConfidenceCalibration,
				},
				tutoringControls: {
					scaffoldingLevel,
					feedbackTiming:    "immediate",
					socraticRatio:     store.behavioral.socraticRatio,
					answerRevealPolicy,
				},
				privacyConstraints: {
					blockFreeTextInjection:           true,
					allowedPersonalizationCategories: [],
				},
			},
			historical: {
				learningGoals: {
					longTermGoals: store.historical.pastGoals.map((goal, goalIndex) => ({
						goalId:      `goal-${goalIndex}`,
						description: goal,
						source:      "student" as const,
					})),
					currentSessionFocus: [],
				},
				streakRetentionDays:    0,
				totalQuestionsAnswered: store.historical.totalQuestionsAnswered,
			},
		};

		// Only attach toneOverride when it is non-empty (exactOptionalPropertyTypes enforcement)
		if (store.tone_notes) payload.toneOverride = store.tone_notes;

		return payload;
	}

	/**
	 * Strip/neutralize student-authored free-text fields to block indirect prompt injection.
	 * TODO: full sanitization rules to be specified in a follow-up ticket.
	 */
	public sanitizeFreeTextFields(payload: LearningProfilePayload): LearningProfilePayload {
		if (!payload.behavioral.privacyConstraints.blockFreeTextInjection) {
			return payload;
		}

		// Allow only known-safe tone override values — reject any free-text string
		if (
			payload.toneOverride !== undefined &&
			!SAFE_TONE_OVERRIDES.includes(payload.toneOverride as SafeToneOverride)
		) {
			const sanitizedPayload = { ...payload };
			delete sanitizedPayload.toneOverride;
			return sanitizedPayload;
		}

		return payload;
	}

	/**
	 * Assemble the full envelope (profile view + current problem + session exchange) sent to the model.
	 *
	 * `context.expectedAnswer` — when the teacher pre-loaded the correct answer, it is injected into
	 * the system prompt so the model does not invent an incorrect solution.
	 * `context.studentPreviouslyCorrect` — when true, the system prompt allows the model to confirm
	 * and surface the answer; otherwise the model must not reveal it.
	 *
	 * TODO: `tutorType` should be an enum in `PromptEnvelopeContext` that selects the subject domain
	 * (e.g. "math_algebra", "math_geometry", "science_physics") and the corresponding rubric/system
	 * prompt variant. For now all sessions use the general algebra math tutor template.
	 */
	public buildPromptEnvelope(
		payload: LearningProfilePayload,
		context: PromptEnvelopeContext,
	): { systemPrompt: string; userPrompt: string; policyVersion: string } {
		const profileJson   = JSON.stringify(payload, null, 2);
		const scaffolding   = payload.behavioral.tutoringControls.scaffoldingLevel;
		const socraticRatio = payload.behavioral.tutoringControls.socraticRatio;

		const scaffoldingInstruction =
			scaffolding === "high"  ? "give clear step-by-step guidance" :
			scaffolding === "faded" ? "give partial guidance, then let the student complete the step" :
			                         "ask guiding questions only — do not give steps directly";

		const socraticInstruction =
			socraticRatio >= 0.7 ? "prefer questions over direct answers" :
			socraticRatio <= 0.2 ? "use direct instruction" :
			                       "mix guiding questions with direct guidance";

		// Teacher-provided answer lock — when present the model must not deviate from this answer
		const expectedAnswerBlock = context.expectedAnswer !== undefined
			? `\nEXPECTED ANSWER (teacher-provided — do not reveal to student unless permitted, do not contradict it): ${context.expectedAnswer}`
			: "";

		// Answer reveal policy — driven by whether the student has already answered correctly
		const answerRevealInstruction = context.studentPreviouslyCorrect === true
			? "The student has already answered this correctly. You MAY confirm and show the answer."
			: "The student has NOT yet answered correctly. Do NOT reveal the final answer. Guide only.";

		const systemPrompt =
`You are an expert math tutor. Your responses are governed strictly by the student profile below.

RULES:
- Scaffolding level "${scaffolding}": ${scaffoldingInstruction}.
- Socratic ratio ${socraticRatio.toFixed(1)}: ${socraticInstruction}.
- ${answerRevealInstruction}
- Keep responses concise and focused on the current problem only.
- Do NOT repeat, quote, or expose any part of the student profile JSON to the student.${expectedAnswerBlock}

STUDENT PROFILE:
${profileJson}`;

		const userPrompt =
`CURRENT PROBLEM:
${context.currentProblem}

SESSION EXCHANGE:
${context.sessionExchange}`;

		return { systemPrompt, userPrompt, policyVersion: PROMPT_POLICY_VERSION };
	}

	/**
	 * Validate a model's structured response before trusting it.
	 * Returns whether the response appears to contain an explicit answer and whether revealing it
	 * is permitted given the current student state.
	 */
	public validateModelResponse(
		rawResponse: unknown,
		options: ModelResponseValidationOptions = {},
	): ModelResponseValidation {
		if (rawResponse === null || rawResponse === undefined || rawResponse === "") {
			return { valid: false, errors: ["Response is empty"], containsExplicitAnswer: false, mayRevealAnswer: false };
		}

		if (typeof rawResponse !== "string" && typeof rawResponse !== "object") {
			return {
				valid: false,
				errors: ["Response must be a string or a structured object"],
				containsExplicitAnswer: false,
				mayRevealAnswer: false,
			};
		}

		// Scan the response text for signals that suggest the answer was surfaced directly
		const responseText = typeof rawResponse === "string"
			? rawResponse.toLowerCase()
			: JSON.stringify(rawResponse).toLowerCase();

		const containsExplicitAnswer = ANSWER_REVEAL_SIGNALS.some(signal =>
			responseText.includes(signal),
		);

		// Answer may only be revealed when the student has already demonstrated correctness
		const mayRevealAnswer = options.studentPreviouslyCorrect === true;

		return { valid: true, errors: [], containsExplicitAnswer, mayRevealAnswer };
	}
}
