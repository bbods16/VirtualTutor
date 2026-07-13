/**
 * SessionEvent — append-only turn/lifecycle log entry for a session.
 * Mirrors all 15 reference-sheet `SessionEvent` Prisma columns in camelCase. Ordered within a
 * session by `seq` (compound-unique on `[sessionId, seq]`); `role`/`eventType` distinguish
 * conversational turns from lifecycle markers (session_start, session_end, heartbeat).
 * Two factories cover the two shapes producers actually create: a scored model/student exchange
 * (`createMessageEvent`) versus a content-less lifecycle marker (`createLifecycleEvent`).
 */
export type EventRole = "student" | "assistant" | "system";
export type EventType = "message" | "session_start" | "session_end" | "heartbeat";

export class SessionEvent {
	private _id: string;
	private _sessionId: string;
	private _studentId: string;
	private _seq: number;
	private _role: EventRole;
	private _eventType: EventType;
	private _content: string | null;
	private _clientTs: Date | null;
	private _serverTs: Date;
	private _profileVersionAtTurn: number;
	private _promptPolicyVersion: string;
	private _acknowledged: boolean;
	private _modelProvider: string | null;
	private _modelName: string | null;
	private _latencyMs: number | null;

	constructor(data: {
		id: string;
		sessionId: string;
		studentId: string;
		seq: number;
		role: EventRole;
		eventType: EventType;
		content?: string | null;
		clientTs?: Date | null;
		serverTs?: Date;
		profileVersionAtTurn: number;
		promptPolicyVersion: string;
		acknowledged?: boolean;
		modelProvider?: string | null;
		modelName?: string | null;
		latencyMs?: number | null;
	}) {
		this._id = data.id;
		this._sessionId = data.sessionId;
		this._studentId = data.studentId;
		this._seq = data.seq;
		this._role = data.role;
		this._eventType = data.eventType;
		this._content = data.content ?? null;
		this._clientTs = data.clientTs ?? null;
		this._serverTs = data.serverTs ?? new Date();
		this._profileVersionAtTurn = data.profileVersionAtTurn;
		this._promptPolicyVersion = data.promptPolicyVersion;
		this._acknowledged = data.acknowledged ?? false;
		this._modelProvider = data.modelProvider ?? null;
		this._modelName = data.modelName ?? null;
		this._latencyMs = data.latencyMs ?? null;
	}

	get id(): string {
		return this._id;
	}
	get sessionId(): string {
		return this._sessionId;
	}
	get studentId(): string {
		return this._studentId;
	}
	get seq(): number {
		return this._seq;
	}
	get role(): EventRole {
		return this._role;
	}
	get eventType(): EventType {
		return this._eventType;
	}
	get content(): string | null {
		return this._content;
	}
	get clientTs(): Date | null {
		return this._clientTs;
	}
	get serverTs(): Date {
		return this._serverTs;
	}
	get profileVersionAtTurn(): number {
		return this._profileVersionAtTurn;
	}
	get promptPolicyVersion(): string {
		return this._promptPolicyVersion;
	}
	get acknowledged(): boolean {
		return this._acknowledged;
	}
	get modelProvider(): string | null {
		return this._modelProvider;
	}
	get modelName(): string | null {
		return this._modelName;
	}
	get latencyMs(): number | null {
		return this._latencyMs;
	}

	/** Build a conversational turn (`eventType: "message"`) — student input or assistant/system reply. */
	public static createMessageEvent(params: {
		id: string;
		sessionId: string;
		studentId: string;
		seq: number;
		role: EventRole;
		content: string;
		clientTs?: Date | null;
		profileVersionAtTurn: number;
		promptPolicyVersion: string;
		modelProvider?: string | null;
		modelName?: string | null;
		latencyMs?: number | null;
	}): SessionEvent {
		return new SessionEvent({
			id: params.id,
			sessionId: params.sessionId,
			studentId: params.studentId,
			seq: params.seq,
			role: params.role,
			eventType: "message",
			content: params.content,
			clientTs: params.clientTs ?? null,
			profileVersionAtTurn: params.profileVersionAtTurn,
			promptPolicyVersion: params.promptPolicyVersion,
			modelProvider: params.modelProvider ?? null,
			modelName: params.modelName ?? null,
			latencyMs: params.latencyMs ?? null,
		});
	}

	/** Build a content-less lifecycle marker (`session_start` | `session_end` | `heartbeat`). */
	public static createLifecycleEvent(params: {
		id: string;
		sessionId: string;
		studentId: string;
		seq: number;
		eventType: Exclude<EventType, "message">;
		profileVersionAtTurn: number;
		promptPolicyVersion: string;
	}): SessionEvent {
		return new SessionEvent({
			id: params.id,
			sessionId: params.sessionId,
			studentId: params.studentId,
			seq: params.seq,
			role: "system",
			eventType: params.eventType,
			content: null,
			profileVersionAtTurn: params.profileVersionAtTurn,
			promptPolicyVersion: params.promptPolicyVersion,
		});
	}
}
