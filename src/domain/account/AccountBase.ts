import type { Consent } from "./Consent.ts";

/**
 * Account — canonical identity & profile-lifecycle record for a student.
 * Implements the legacy `Account` contract from `AccountConsentState/Account.ts` (previously an
 * empty class implementing an interface). camelCased fields mirror the `Student` Prisma model plus
 * the embedded `Consent` sub-record. `profileStatus` gates whether a tutoring session may start;
 * `activeSessionId` enforces the single-active-session invariant (one live session per student).
 */
export type ProfileStatus =
	| "pendingQuiz"
	| "building"
	| "ready"
	| "buildFailed"
	| "archived";

export class Account {
	private _accountId: string;
	private _studentId: string;
	private _email: string;
	private _createdAt: Date;
	private _profileStatus: ProfileStatus;
	private _activeSessionId: string | null;
	private _consent: Consent;

	constructor(data: {
		accountId: string;
		studentId: string;
		email: string;
		createdAt?: Date;
		profileStatus?: ProfileStatus;
		activeSessionId?: string | null;
		consent: Consent;
	}) {
		this._accountId = data.accountId;
		this._studentId = data.studentId;
		this._email = data.email;
		this._createdAt = data.createdAt ?? new Date();
		this._profileStatus = data.profileStatus ?? "pendingQuiz";
		this._activeSessionId = data.activeSessionId ?? null;
		this._consent = data.consent;
	}

	get accountId(): string {
		return this._accountId;
	}
	get studentId(): string {
		return this._studentId;
	}
	get email(): string {
		return this._email;
	}
	get createdAt(): Date {
		return this._createdAt;
	}
	get profileStatus(): ProfileStatus {
		return this._profileStatus;
	}
	get activeSessionId(): string | null {
		return this._activeSessionId;
	}
	get consent(): Consent {
		return this._consent;
	}
	// TODO no duplicate emails not implemented, implement a hashmap for no duplicates
	public setEmail(email: string): void {
		this._email = email;
	}

	public setProfileStatus(status: ProfileStatus): void {
		this._profileStatus = status;
	}

	public setActiveSessionId(sessionId: string | null): void {
		this._activeSessionId = sessionId;
	}

	public clearActiveSession(): void {
		this._activeSessionId = null;
	}

	/** A new session may start only once the profile is built and no session is already live. */
	public canStartSession(): boolean {
		return this._profileStatus === "ready" && this._activeSessionId === null;
	}
}
