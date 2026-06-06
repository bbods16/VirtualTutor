/**
 * Final Learning Profile JSON Schema
 * Recombines the segmented database columns (Cognitive, Behavioral, Historical)
 * into a single, strongly-typed DTO for the Prompt Converter pipeline.
 */
export interface LearningProfilePayload {
	/** Schema version ensures backwards compatibility with the prompt converter. */
	schemaVersion: "1.2.0";

	learnerIdentity: {
		/** SHA-256 hash strictly replacing plaintext PII (FERPA / Ed Law 2-d compliance) */
		studentIdHash: string;
		displayName?: string;
		gradeLevel: number | "higher_ed" | "adult";
		locale: string; // IETF language tag, e.g., "en-US"
	};

	/** Maps directly to the `cognitive` JSONB column */
	cognitive: {
		skills: Record<
			string,
			{
				skillName: string;
				/** BKT P(L_t) parameter representing true mastery [0.0 - 1.0] */
				masteryProbability: number;
				/** BKT P(S) parameter representing execution errors [0.0 - 1.0] */
				slipRate: number;
				/** BKT P(G) parameter representing heuristic guessing [0.0 - 1.0] */
				guessRate: number;
				/** FSRS retention metric R(t) [0.0 - 1.0] */
				retrievabilityScore: number;
				dueForReview: boolean;
			}
		>;
		activeMisconceptions: Array<{
			misconceptionId: string;
			description: string;
			/** Statistical confidence in the misconception diagnosis [0.0 - 1.0] */
			confidence: number;
		}>;
	};

	/** Maps directly to the `behavioral` JSONB column */
	behavioral: {
		accessibility: {
			readingLevelAdjustment: "simplified" | "standard" | "advanced";
			cognitiveLoadLimit: "low" | "standard" | "high";
			modalityPreference: "text_heavy" | "visual_heavy" | "auditory_heavy";
			explicitContentWarnings?: string[];
		};
		transientState: {
			frustrationIndex: number; // [0.0 - 1.0]
			helpSeekingBehavior: "avoidant" | "optimal" | "dependent";
		};
		tutoringControls: {
			scaffoldingLevel: "none" | "faded" | "high";
			feedbackTiming: "immediate" | "delayed";
			/** 1.0 = Pure Socratic questioning; 0.0 = Direct didactic instruction */
			socraticRatio: number;
			answerRevealPolicy: "never" | "after_3_attempts" | "on_request";
		};
		privacyConstraints: {
			/** If true, the converter strips user free-text to block indirect prompt injection. */
			blockFreeTextInjection: boolean;
			allowedPersonalizationCategories: string[];
		};
	};

	/** Maps directly to the `historical` JSONB column */
	historical: {
		learningGoals: {
			longTermGoals: Array<{
				goalId: string;
				description: string;
				source: "student" | "teacher" | "system";
			}>;
			currentSessionFocus: Array<{
				topicId: string;
				skillTarget: string;
				priority: number; // 1 (highest) to 5 (lowest)
			}>;
		};
		streakRetentionDays: number;
		totalQuestionsAnswered: number;
	};

	/** Maps directly to the `tone_notes` TEXT column */
	toneOverride?: "encouraging" | "direct" | "analytical" | string;
}
