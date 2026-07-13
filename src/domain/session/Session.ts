/**
 * Session — one disposable tutoring conversation lifecycle record.
 * Mirrors the `Session` Prisma model. Per the Three Laws of the Tutor Engine
 * (firstDocument.md), the conversation itself is never persisted as long-term memory —
 * only this lifecycle envelope and its derived `ProfilePatch` survive past session end.
 * Status transitions are linear and one-way: active → ended → finalized, or → error.
 */
export type SessionStatus = "active" | "ended" | "finalized" | "error";

export class Session {
	private _sessionId: string;
	private _studentId: string;
	private _status: SessionStatus;
	private _profileVersionAtStart: number;
	private _startedAt: Date;
	private _endedAt: Date | null;

	constructor(data: {
		sessionId: string;
		studentId: string;
		status?: SessionStatus;
		profileVersionAtStart: number;
		startedAt?: Date;
		endedAt?: Date | null;
	}) {
		this._sessionId = data.sessionId;
		this._studentId = data.studentId;
		this._status = data.status ?? "active";
		this._profileVersionAtStart = data.profileVersionAtStart;
		this._startedAt = data.startedAt ?? new Date();
		this._endedAt = data.endedAt ?? null;
	}

	get sessionId(): string {
		return this._sessionId;
	}
	get studentId(): string {
		return this._studentId;
	}
	get status(): SessionStatus {
		return this._status;
	}
	get profileVersionAtStart(): number {
		return this._profileVersionAtStart;
	}
	get startedAt(): Date {
		return this._startedAt;
	}
	get endedAt(): Date | null {
		return this._endedAt;
	}

	public markEnded(): void {
		this._status = "ended";
		this._endedAt = new Date();
	}

	public markFinalized(): void {
		if (this._status !== "ended") {
			throw new Error("Session must be ended before it can be finalized");
		}
		this._status = "finalized";
	}

	public markError(): void {
		this._status = "error";
	}

	public isActive(): boolean {
		return this._status === "active";
	}
}
