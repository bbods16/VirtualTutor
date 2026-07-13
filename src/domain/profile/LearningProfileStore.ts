import type { ProfilePatch } from "./ProfilePatch.ts";

/**
 * LearningProfileStore — canonical, persisted representation of what the system understands about
 * a student. Renamed from the legacy `LearningProfile` (in `LearningProfile/Base.ts`) to make the
 * canonical/prompt-view dialect split explicit: this class is backend-internal persistence;
 * `LearningProfilePromptView` is the derived, sanitized, prompt-facing projection (never conflate
 * the two — see ALGORITHM_SCAFFOLD_PLAN.md §1).
 *
 * Adds KC-level mastery tracking (flags.MD flag 3 — 16 KCs per skill) and a dedicated
 * metacognitive-regulation sub-profile (flags.MD flag 2 — the long-term outcome the mastery
 * matrix is merely an intermediate metric for).
 */

/**
 * Prerequisite mastery threshold (flags.MD flag 1): a student must reach this P(L) on the
 * prerequisite skill (e.g. "variable-as-co-varying-quantity") before the dependent skill
 * (e.g. "slope-intercept") is unlocked.
 */
export const PREREQUISITE_MASTERY_THRESHOLD = 0.75;

/** flags.MD flag 3 — per-Knowledge-Component mastery tracking beneath each skill. */
export interface KCState {
	kcId: string;
	kcName: string;
	masteryScore: number;
	exposureCount: number;
}

/** flags.MD flag 2 — metacognitive regulation sub-profile, kept separate from the mastery matrix. */
export interface MetacognitionState {
	selfReportConfidenceCalibration: number;
	helpSeeking: "avoidant" | "optimal" | "dependent";
	persistence: number;
}

export interface SkillState {
	masteryProbability: number;
	slipRate: number;
	guessRate: number;
	difficulty: number;
	stability: number;
	lastReviewDate: Date;
	dueForReview: boolean;
	knowledgeComponents: Record<string, KCState>;
}

export interface CognitiveState {
	skills: Record<string, SkillState>;
	misconceptions: Array<{
		id: string;
		confidenceScore: number;
	}>;
	metacognition: MetacognitionState;
}

export interface BehavioralState {
	frustrationIndex: number;
	scaffoldingLevel: "NONE" | "FADED" | "HIGH";
	socraticRatio: number;
	answerRevealPolicy: "NEVER" | "AFTER_3_ATTEMPTS" | "ON_REQUEST";
	failedAttemptsCounter: number;
}

export interface HistoricalState {
	pastGoals: string[];
	totalQuestionsAnswered: number;
	masteredSkillIds: string[];
}

export class LearningProfileStore {
	private _id: string;
	private _student_id: string;
	private _cognitive: CognitiveState;
	private _behavioral: BehavioralState;
	private _historical: HistoricalState;
	private _tone_notes: string;
	private _last_delta_at: Date;
	private _schemaVersion: string;
	private _profileVersion: number;
	private _generatedFrom: Record<string, unknown> | null;
	/** Grade level extracted from the intake quiz — used by PromptProjectionService to build the learner identity. */
	private _gradeLevel: number | "higher_ed" | "adult";
	/** IETF locale tag extracted from the intake quiz (e.g. "en-US"). */
	private _locale: string;

	constructor(data: {
		id: string;
		student_id: string;
		cognitive: CognitiveState;
		behavioral: BehavioralState;
		historical: HistoricalState;
		tone_notes: string;
		last_delta_at?: Date;
		schemaVersion?: string;
		profileVersion?: number;
		generatedFrom?: Record<string, unknown> | null;
		gradeLevel?: number | "higher_ed" | "adult";
		locale?: string;
	}) {
		this._id = data.id;
		this._student_id = data.student_id;
		this._cognitive = data.cognitive;
		this._behavioral = data.behavioral;
		this._historical = data.historical;
		this._tone_notes = data.tone_notes;
		this._last_delta_at = data.last_delta_at || new Date();
		this._schemaVersion = data.schemaVersion ?? "1.3.0";
		this._profileVersion = data.profileVersion ?? 1;
		this._generatedFrom = data.generatedFrom ?? null;
		this._gradeLevel = data.gradeLevel ?? 9;
		this._locale = data.locale ?? "en-US";
	}

	get id() {
		return this._id;
	}
	get student_id() {
		return this._student_id;
	}
	get cognitive() {
		return this._cognitive;
	}
	get behavioral() {
		return this._behavioral;
	}
	get historical() {
		return this._historical;
	}
	get tone_notes() {
		return this._tone_notes;
	}
	get schemaVersion(): string {
		return this._schemaVersion;
	}
	get profileVersion(): number {
		return this._profileVersion;
	}
	get generatedFrom(): Record<string, unknown> | null {
		return this._generatedFrom;
	}
	get gradeLevel(): number | "higher_ed" | "adult" {
		return this._gradeLevel;
	}
	get locale(): string {
		return this._locale;
	}
	set gradeLevel(value: number | "higher_ed" | "adult") {
		this._gradeLevel = value;
	}
	set locale(value: string) {
		this._locale = value;
	}

	set schemaVersion(version: string) {
		this._schemaVersion = version;
	}
	set profileVersion(version: number) {
		this._profileVersion = version;
	}
	set generatedFrom(source: Record<string, unknown> | null) {
		this._generatedFrom = source;
	}

	public getSkillState(skillId: string): SkillState | undefined {
		return this._cognitive.skills[skillId];
	}

	public updateSkillMastery(skillId: string, newProbability: number): void {
		if (!this._cognitive.skills[skillId]) throw new Error("Skill not found");

		this._cognitive.skills[skillId].masteryProbability = Math.max(
			0.0001,
			Math.min(newProbability, 0.9999),
		);
		this.markDelta();
	}

	public adjustFrustration(delta: number): void {
		const newIndex = this._behavioral.frustrationIndex + delta;
		this._behavioral.frustrationIndex = Math.max(0.0, Math.min(newIndex, 1.0));

		// This latch must be reversible in both directions — otherwise a student who calms back
		// down under the frustration threshold stays stuck in "HIGH" scaffolding/direct-only tone
		// forever, since nothing else re-evaluates these fields once set (DSR audit finding).
		// Reverting to the neutral "NONE"/1.0 state (rather than inventing a frustration-driven
		// "FADED" tier) mirrors resetSessionStates — mastery-driven fading is computeScaffoldingAndTone's
		// job, not this store's; this only undoes what the HIGH branch above did.
		if (this._behavioral.frustrationIndex > 0.75) {
			this._behavioral.scaffoldingLevel = "HIGH";
			this._behavioral.socraticRatio = 0.0;
		} else if (this._behavioral.scaffoldingLevel === "HIGH") {
			this._behavioral.scaffoldingLevel = "NONE";
			this._behavioral.socraticRatio = 1.0;
		}
		this.markDelta();
	}

	/**
	 * Records a failed attempt on the current problem step. Returns true when the
	 * `AFTER_3_ATTEMPTS` reveal policy has just been triggered, signaling the caller to reveal
	 * the answer and advance rather than let the step continue indefinitely.
	 */
	public recordFailedAttempt(): boolean {
		this._behavioral.failedAttemptsCounter += 1;
		const answerShouldBeRevealed =
			this._behavioral.answerRevealPolicy === "AFTER_3_ATTEMPTS" &&
			this._behavioral.failedAttemptsCounter >= 3;
		if (answerShouldBeRevealed) {
			this._behavioral.scaffoldingLevel = "HIGH";
			this._behavioral.socraticRatio = 0.0;
		}
		this.markDelta();
		return answerShouldBeRevealed;
	}

	/** Reset the per-step failed-attempts counter on advancing to a new problem — this counter
	 *  tracks attempts on the *current* step, not the student's session-lifetime frustration
	 *  state (frustrationIndex/scaffoldingLevel persist across problems by design). */
	public resetAttemptCounter(): void {
		this._behavioral.failedAttemptsCounter = 0;
		this.markDelta();
	}

	public resetSessionStates(): void {
		this._behavioral.failedAttemptsCounter = 0;
		this._behavioral.scaffoldingLevel = "NONE";
		this._behavioral.socraticRatio = 1.0;
		this.markDelta();
	}

	private markDelta() {
		this._last_delta_at = new Date();
	}

	public toJSON() {
		return {
			cognitive: this._cognitive,
			behavioral: this._behavioral,
			historical: this._historical,
		};
	}

	/** Atomically apply a finalized patch (compare-and-swap on profileVersion).
	 *  @see src/services/FinalizerService.ts (applyPatchCompareAndSwap) */
	public applyPatch(patch: ProfilePatch): void {
		// The caller (FinalizerService.applyPatchCompareAndSwap) is responsible for the
		// compare-and-swap version check — this method just applies the operations and bumps the version.
		for (const operation of patch.operations) {
			if (
				operation.op === "update_mastery" &&
				operation.skillId !== undefined &&
				operation.masteryDelta !== undefined
			) {
				const targetSkill = this._cognitive.skills[operation.skillId];
				if (targetSkill !== undefined) {
					targetSkill.masteryProbability = Math.max(
						0.0001,
						Math.min(
							0.9999,
							targetSkill.masteryProbability + operation.masteryDelta,
						),
					);
				}
			} else if (
				operation.op === "update_behavioral" &&
				operation.path !== undefined &&
				operation.value !== undefined
			) {
				// Dot-path write into _behavioral (e.g. "frustrationIndex" or "scaffoldingLevel")
				const pathSegments = operation.path.split(".");
				let targetObject: Record<string, unknown> = this
					._behavioral as unknown as Record<string, unknown>;
				let pathResolved = true;
				for (
					let segmentIndex = 0;
					segmentIndex < pathSegments.length - 1;
					segmentIndex++
				) {
					const segment = pathSegments[segmentIndex];
					if (segment === undefined) continue;
					const nextObject = targetObject[segment];
					if (typeof nextObject !== "object" || nextObject === null) {
						// Unresolvable path segment (e.g. a typo'd patch) — do not write through undefined
						pathResolved = false;
						break;
					}
					targetObject = nextObject as Record<string, unknown>;
				}
				const lastSegment = pathSegments[pathSegments.length - 1];
				if (pathResolved && lastSegment !== undefined) {
					targetObject[lastSegment] = operation.value;
				}
			}
		}
		this._profileVersion = patch.newProfileVersion;
		this.markDelta();
	}

	/** 0.75/0.80 prerequisite gate (flags.MD flag 1: variable-as-co-varying-quantity ≥ 0.75
	 *  before slope-intercept). @see src/algorithms/BKT/BayesianKnowledgeTracing.ts (computeMasteryThreshold) */
	public checkPrerequisiteGate(skillId: string): boolean {
		// flags.MD flag 1 specifies PREREQUISITE_MASTERY_THRESHOLD on the prereq skill before unlocking dependent content
		const targetSkill = this._cognitive.skills[skillId];
		if (targetSkill === undefined) return false;
		return targetSkill.masteryProbability >= PREREQUISITE_MASTERY_THRESHOLD;
	}
}
