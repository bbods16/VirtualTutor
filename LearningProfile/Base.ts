/**
 * Overview:
 * This file contains the foundational TypeScript domain models and interfaces for the AI Tutor system.
 * * Purpose:
 * It enforces strict type safety for database JSON payloads (Cognitive, Behavioral, and Historical states)
 * and provides fully encapsulated classes (User, Student, LearningProfile, IntakeQuiz, SystemErrorLog).
 * These classes handle data validation, automatic timestamp tracking, and contain the utility methods
 * required to mutate state safely before and during mathematical algorithm execution.
 */

export interface SkillState {
	masteryProbability: number;
	slipRate: number;
	guessRate: number;
	difficulty: number;
	stability: number;
	lastReviewDate: Date;
	dueForReview: boolean;
}

export interface CognitiveState {
	skills: Record<string, SkillState>;
	misconceptions: Array<{
		id: string;
		confidenceScore: number;
	}>;
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

export class User {
	private _id: string;
	private _email: string;
	private _password_hash: string;
	private _created_at: Date;
	private _updated_at: Date;

	constructor(data: {
		id: string;
		email: string;
		password_hash: string;
		created_at?: Date;
		updated_at?: Date;
	}) {
		this._id = data.id;
		this._email = data.email;
		this._password_hash = data.password_hash;
		this._created_at = data.created_at || new Date();
		this._updated_at = data.updated_at || new Date();
	}

	get id() {
		return this._id;
	}
	get email() {
		return this._email;
	}
	get created_at() {
		return this._created_at;
	}
	get updated_at() {
		return this._updated_at;
	}

	set email(newEmail: string) {
		this._email = newEmail;
		this.touch();
	}

	set password_hash(newHash: string) {
		this._password_hash = newHash;
		this.touch();
	}

	private touch() {
		this._updated_at = new Date();
	}
}

export class Student {
	private _id: string;
	private _user_id: string;
	private _lp_exists: boolean;
	private _session_count: number;
	private _created_at: Date;
	private _updated_at: Date;

	constructor(data: {
		id: string;
		user_id: string;
		lp_exists?: boolean;
		session_count?: number;
		created_at?: Date;
		updated_at?: Date;
	}) {
		this._id = data.id;
		this._user_id = data.user_id;
		this._lp_exists = data.lp_exists ?? false;
		this._session_count = data.session_count ?? 0;
		this._created_at = data.created_at || new Date();
		this._updated_at = data.updated_at || new Date();
	}

	get id() {
		return this._id;
	}
	get user_id() {
		return this._user_id;
	}
	get lp_exists() {
		return this._lp_exists;
	}
	get session_count() {
		return this._session_count;
	}

	set lp_exists(status: boolean) {
		this._lp_exists = status;
		this.touch();
	}

	public incrementSessionCount(): void {
		this._session_count += 1;
		this.touch();
	}

	private touch() {
		this._updated_at = new Date();
	}
}

export class LearningProfile {
	private _id: string;
	private _student_id: string;
	private _cognitive: CognitiveState;
	private _behavioral: BehavioralState;
	private _historical: HistoricalState;
	private _tone_notes: string;
	private _last_delta_at: Date;

	constructor(data: {
		id: string;
		student_id: string;
		cognitive: CognitiveState;
		behavioral: BehavioralState;
		historical: HistoricalState;
		tone_notes: string;
		last_delta_at?: Date;
	}) {
		this._id = data.id;
		this._student_id = data.student_id;
		this._cognitive = data.cognitive;
		this._behavioral = data.behavioral;
		this._historical = data.historical;
		this._tone_notes = data.tone_notes;
		this._last_delta_at = data.last_delta_at || new Date();
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

		if (this._behavioral.frustrationIndex > 0.75) {
			this._behavioral.scaffoldingLevel = "HIGH";
			this._behavioral.socraticRatio = 0.0;
		}
		this.markDelta();
	}

	public recordFailedAttempt(): void {
		this._behavioral.failedAttemptsCounter += 1;
		if (
			this._behavioral.answerRevealPolicy === "AFTER_3_ATTEMPTS" &&
			this._behavioral.failedAttemptsCounter >= 3
		) {
		}
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
}

export class IntakeQuiz {
	private _id: string;
	private _student_id: string;
	private _raw_responses: Record<string, any>;
	private _rag_output: string;
	private _submitted_at: Date;
	private _processed: boolean;
	private _processing_status: string;

	constructor(data: {
		id: string;
		student_id: string;
		raw_responses: any;
		rag_output: string;
		submitted_at?: Date;
		processed?: boolean;
		processing_status?: string;
	}) {
		this._id = data.id;
		this._student_id = data.student_id;
		this._raw_responses = data.raw_responses;
		this._rag_output = data.rag_output;
		this._submitted_at = data.submitted_at || new Date();
		this._processed = data.processed ?? false;
		this._processing_status = data.processing_status || "Pending";
	}

	get id() {
		return this._id;
	}
	get student_id() {
		return this._student_id;
	}
	get rag_output() {
		return this._rag_output;
	}
	get processed() {
		return this._processed;
	}
	get processing_status() {
		return this._processing_status;
	}

	public markAsProcessing(statusMessage: string): void {
		this._processing_status = statusMessage;
	}

	public markAsCompleted(finalRagOutput: string): void {
		this._rag_output = finalRagOutput;
		this._processed = true;
		this._processing_status = "Completed";
	}
}

export class SystemErrorLog {
	private _id: string;
	private _student_id: string | null;
	private _error_component: string;
	private _error_details: string;
	private _is_resolved: boolean;
	private _created_at: Date;

	constructor(data: {
		id: string;
		student_id: string | null;
		error_component: string;
		error_details: string;
		is_resolved?: boolean;
		created_at?: Date;
	}) {
		this._id = data.id;
		this._student_id = data.student_id;
		this._error_component = data.error_component;
		this._error_details = data.error_details;
		this._is_resolved = data.is_resolved ?? false;
		this._created_at = data.created_at || new Date();
	}

	get id() {
		return this._id;
	}
	get error_component() {
		return this._error_component;
	}
	get error_details() {
		return this._error_details;
	}
	get is_resolved() {
		return this._is_resolved;
	}

	public resolveError(): void {
		this._is_resolved = true;
	}
}
export class TopicCognitiveState {}
