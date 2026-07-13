/**
 * IntakeQuiz — lifted verbatim from `LearningProfile/Base.ts` (no logic change).
 * Captures the raw intake-quiz responses and the RAG-generated narrative output used to
 * seed `buildInitialProfile`. Tracks processing lifecycle (`Pending` → `Completed`).
 */
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
	get raw_responses(): Record<string, unknown> {
		return this._raw_responses as Record<string, unknown>;
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
