import { Session } from "@domain/session/Session.ts";
import { SessionEvent } from "@domain/session/SessionEvent.ts";
import type { EventRole, EventType } from "@domain/session/SessionEvent.ts";

/**
 * SessionService — owns the session lifecycle and its append-only event log.
 * Owns: starting/ending sessions (enforcing the single-active-session invariant via
 * `Account.canStartSession`), appending `SessionEvent`s in `seq` order, and surfacing the
 * event log for finalization. Does NOT own: profile mutation (ProfileService), prompt
 * construction (PromptProjectionService), or patch generation (FinalizerService).
 *
 * In terminal mode all state is in-memory — no Prisma calls are made.
 */

/** Prompt policy version stamped onto every SessionEvent — bumped when the policy changes. */
const CURRENT_PROMPT_POLICY_VERSION = "1.0.0";

export class SessionService {
	/** In-memory session store keyed by session ID. */
	private readonly sessionsById   = new Map<string, Session>();
	/** In-memory event log keyed by session ID. */
	private readonly eventsBySessionId = new Map<string, SessionEvent[]>();
	/** Sequence counter keyed by session ID — incremented on every append. */
	private readonly seqCounterBySessionId = new Map<string, number>();

	/** Start a new active session for a student, stamping `profileVersionAtStart`. */
	public async startSession(studentId: string, profileVersionAtStart: number): Promise<Session> {
		const newSession = new Session({
			sessionId:             crypto.randomUUID(),
			studentId,
			status:                "active",
			profileVersionAtStart,
		});

		this.sessionsById.set(newSession.sessionId, newSession);
		this.eventsBySessionId.set(newSession.sessionId, []);
		this.seqCounterBySessionId.set(newSession.sessionId, 0);

		return newSession;
	}

	/** Append the next `SessionEvent` (by `seq`) to an active session's log. */
	public async appendEvent(
		sessionId: string,
		event: { role: EventRole; eventType: EventType; content?: string | null },
	): Promise<SessionEvent> {
		const targetSession = this.sessionsById.get(sessionId);
		if (!targetSession) {
			throw new Error(`Session ${sessionId} not found`);
		}

		const nextSequenceNumber = (this.seqCounterBySessionId.get(sessionId) ?? 0) + 1;
		this.seqCounterBySessionId.set(sessionId, nextSequenceNumber);

		const newEvent = SessionEvent.createMessageEvent({
			id:                    crypto.randomUUID(),
			sessionId,
			studentId:             targetSession.studentId,
			seq:                   nextSequenceNumber,
			role:                  event.role,
			content:               event.content ?? "",
			profileVersionAtTurn:  targetSession.profileVersionAtStart,
			promptPolicyVersion:   CURRENT_PROMPT_POLICY_VERSION,
		});

		this.eventsBySessionId.get(sessionId)!.push(newEvent);
		return newEvent;
	}

	/** Retrieve the full ordered event log for a session (finalization input). */
	public async getSessionEvents(sessionId: string): Promise<SessionEvent[]> {
		return this.eventsBySessionId.get(sessionId) ?? [];
	}

	/** Mark a session ended (active → ended) and clear the student's active-session pointer. */
	public async endSession(sessionId: string): Promise<Session> {
		const targetSession = this.sessionsById.get(sessionId);
		if (!targetSession) {
			throw new Error(`Session ${sessionId} not found`);
		}
		targetSession.markEnded();
		return targetSession;
	}
}
