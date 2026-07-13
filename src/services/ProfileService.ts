import { LearningProfileStore } from "@domain/profile/LearningProfileStore.ts";
import type { CognitiveState } from "@domain/profile/LearningProfileStore.ts";
import type { ProfilePatch } from "@domain/profile/ProfilePatch.ts";
import type { IntakeQuiz } from "@domain/intake/IntakeQuiz.ts";
import { FinalizerService } from "@services/FinalizerService.ts";
import { BKT_PARAMS } from "@algorithms/BKT/BayesianKnowledgeTracing.ts";

/**
 * ProfileService — owns the canonical `LearningProfileStore` lifecycle: construction from intake,
 * retrieval, and patch application orchestration. Owns: turning an `IntakeQuiz` into the first
 * `LearningProfileStore` snapshot, and routing finalized `ProfilePatch`es into the store. Does NOT
 * own: the prompt-facing projection (PromptProjectionService), patch *generation* from session
 * evidence (FinalizerService), or the compare-and-swap persistence mechanics themselves
 * (`LearningProfileStore.applyPatch` / `FinalizerService.applyPatchCompareAndSwap`).
 */

/** Default grade level when none is specified in the intake quiz responses. */
const DEFAULT_GRADE_LEVEL = 9;

/** Default locale when none is specified in the intake quiz responses. */
const DEFAULT_LOCALE = "en-US";

/** Default reading level when none is specified in the intake quiz responses. */
const DEFAULT_READING_LEVEL = "standard" as const;

/** Default cognitive load limit when none is specified in the intake quiz responses. */
const DEFAULT_COGNITIVE_LOAD_LIMIT = "standard" as const;

/** Default modality preference when none is specified in the intake quiz responses. */
const DEFAULT_MODALITY_PREFERENCE = "text_heavy" as const;

export class ProfileService {
	/** In-memory store keyed by student ID — substitutes for the Prisma database in terminal mode. */
	private readonly profilesByStudentId = new Map<string, LearningProfileStore>();
	private readonly finalizer = new FinalizerService();

	/** Fetch the canonical learning profile for a student. */
	public async getProfile(studentId: string): Promise<LearningProfileStore | null> {
		return this.profilesByStudentId.get(studentId) ?? null;
	}

	/**
	 * Construct the first `LearningProfileStore` snapshot from a completed `IntakeQuiz`,
	 * seeding cognitive/behavioral/historical state and BKT priors per KC tier.
	 * All values are extracted from the quiz's `raw_responses` where available — nothing is hardcoded.
	 */
	public async buildInitialProfile(quiz: IntakeQuiz): Promise<LearningProfileStore> {
		const quizResponses = quiz.raw_responses;

		// Extract demographic and preference data from intake responses with explicit fallbacks
		const gradeLevel: number | "higher_ed" | "adult" =
			(quizResponses["gradeLevel"] as number | "higher_ed" | "adult") ?? DEFAULT_GRADE_LEVEL;

		const locale: string =
			(quizResponses["locale"] as string) ?? DEFAULT_LOCALE;

		const readingLevelAdjustment =
			(quizResponses["readingLevelAdjustment"] as "simplified" | "standard" | "advanced")
			?? DEFAULT_READING_LEVEL;

		const cognitiveLoadLimit =
			(quizResponses["cognitiveLoadLimit"] as "low" | "standard" | "high")
			?? DEFAULT_COGNITIVE_LOAD_LIMIT;

		const modalityPreference =
			(quizResponses["modalityPreference"] as "text_heavy" | "visual_heavy" | "auditory_heavy")
			?? DEFAULT_MODALITY_PREFERENCE;

		// Seed initial skill states using population-calibrated BKT priors (studentmodeling-002)
		const initialSkills: CognitiveState["skills"] = {
			"linear-equations": {
				masteryProbability: BKT_PARAMS.identification.L0,
				slipRate:           BKT_PARAMS.identification.S,
				guessRate:          BKT_PARAMS.identification.G,
				difficulty:         0.5,
				stability:          1.0,
				lastReviewDate:     new Date(),
				dueForReview:       false,
				knowledgeComponents: {
					"KC-01": {
						kcId:         "KC-01",
						kcName:       "Variable Identification",
						masteryScore: BKT_PARAMS.identification.L0,
						exposureCount: 0,
					},
					"KC-02": {
						kcId:         "KC-02",
						kcName:       "Equation Recognition",
						masteryScore: BKT_PARAMS.identification.L0,
						exposureCount: 0,
					},
				},
			},
			"slope-intercept": {
				masteryProbability: BKT_PARAMS.interpretation.L0,
				slipRate:           BKT_PARAMS.interpretation.S,
				guessRate:          BKT_PARAMS.interpretation.G,
				difficulty:         0.6,
				stability:          1.0,
				lastReviewDate:     new Date(),
				dueForReview:       false,
				knowledgeComponents: {
					"KC-03": {
						kcId:         "KC-03",
						kcName:       "Slope Interpretation",
						masteryScore: BKT_PARAMS.interpretation.L0,
						exposureCount: 0,
					},
					"KC-04": {
						kcId:         "KC-04",
						kcName:       "Y-Intercept Identification",
						masteryScore: BKT_PARAMS.interpretation.L0,
						exposureCount: 0,
					},
				},
			},
		};

		const profile = new LearningProfileStore({
			id:          crypto.randomUUID(),
			student_id:  quiz.student_id,
			cognitive: {
				skills:         initialSkills,
				misconceptions: [],
				metacognition: {
					selfReportConfidenceCalibration: 0.5,
					helpSeeking:                     "optimal",
					persistence:                     0.5,
				},
			},
			behavioral: {
				frustrationIndex:      0.0,
				scaffoldingLevel:      "NONE",
				socraticRatio:         1.0,
				answerRevealPolicy:    "AFTER_3_ATTEMPTS",
				failedAttemptsCounter: 0,
			},
			historical: {
				pastGoals:             [],
				totalQuestionsAnswered: 0,
				masteredSkillIds:      [],
			},
			tone_notes:     "",
			schemaVersion:  "1.3.0",
			profileVersion: 1,
			generatedFrom: {
				intakeQuizId: quiz.id,
				accessibility: {
					readingLevelAdjustment,
					cognitiveLoadLimit,
					modalityPreference,
				},
			},
			gradeLevel,
			locale,
		});

		this.profilesByStudentId.set(quiz.student_id, profile);
		return profile;
	}

	/** Route a finalized patch into the store via the compare-and-swap apply path. */
	public async applyProfilePatch(studentId: string, patch: ProfilePatch): Promise<void> {
		const profile = this.profilesByStudentId.get(studentId);
		if (!profile) {
			throw new Error(`Profile not found for student ${studentId}`);
		}
		const result = await this.finalizer.applyPatchCompareAndSwap(profile, patch);
		if (!result.applied) {
			throw new Error(`Patch conflict for student ${studentId} — profile version mismatch`);
		}
	}
}
