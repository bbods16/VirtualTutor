import Redis from "ioredis";

/**
 * RedisSessionCache — live-session conversation buffer (refactor of the comment-only
 * `DBEngines/Redis/base.ts` design notes into a real `ioredis`-backed class).
 * Key design: `session:{student_id}` — one key per student; a defensive second write
 * for the same student overwrites the first (architecture prevents concurrent sessions,
 * but this is the correct behavior if it ever happens). Value: the `ConversationHistory`
 * hashmap serialized as JSON. TTL: 4 hours (14400s), refreshed on every message exchange
 * so active sessions never expire mid-conversation. On session end, `FinalizerService`
 * reads this value, runs the differential merge into Postgres, then explicitly `DEL`s
 * the key rather than waiting on the TTL.
 *
 * TODO: `ActiveSessionLRUCache` (see `AccountConsentState/LRUCache.ts`) is a future task,
 * out of scope for this class.
 */
export interface ConversationHistory {
	[index: number]: { index: number; userInput: string; llmOutput: string };
}

const SESSION_TTL_SECONDS = 14400;

export class RedisSessionCache {
	private _client: Redis;

	constructor(connectionUrl: string) {
		this._client = new Redis(connectionUrl);
	}

	private key(studentId: string): string {
		return `session:${studentId}`;
	}

	/** SET session:{studentId} to the JSON-serialized history with a 4-hour TTL. */
	public async setSession(
		studentId: string,
		history: ConversationHistory,
	): Promise<void> {
		await this._client.set(
			this.key(studentId),
			JSON.stringify(history),
			"EX",
			SESSION_TTL_SECONDS,
		);
	}

	/** GET session:{studentId} and JSON.parse the stored history, or null if absent. */
	public async getSession(
		studentId: string,
	): Promise<ConversationHistory | null> {
		const raw = await this._client.get(this.key(studentId));
		// why are we returning null on a get session, maybe we should specify some key other than that to specify there is no currently active session
		return raw ? (JSON.parse(raw) as ConversationHistory) : null;
	}

	/** EXPIRE session:{studentId} 14400 — reset the TTL on every message exchange. */
	public async refreshTTL(studentId: string): Promise<void> {
		await this._client.expire(this.key(studentId), SESSION_TTL_SECONDS);
	}

	/** DEL session:{studentId} — explicit cleanup once the DeltaProcessor has merged the session. */
	public async deleteSession(studentId: string): Promise<void> {
		await this._client.del(this.key(studentId));
	}
}
