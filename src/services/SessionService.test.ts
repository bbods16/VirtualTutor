import { describe, it, expect } from "vitest";
import { SessionService } from "./SessionService.ts";

// ── SessionService ────────────────────────────────────────────────────────────

describe("SessionService.startSession", () => {
  it("returns a Session in 'active' status", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    expect(session.status).toBe("active");
  });

  it("stamps the correct studentId on the session", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    expect(session.studentId).toBe("student-001");
  });

  it("stamps profileVersionAtStart on the session", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 5);
    expect(session.profileVersionAtStart).toBe(5);
  });

  it("each call returns a unique session ID", async () => {
    const service = new SessionService();
    const sessionA = await service.startSession("student-001", 1);
    const sessionB = await service.startSession("student-001", 1);
    expect(sessionA.sessionId).not.toBe(sessionB.sessionId);
  });
});

describe("SessionService.appendEvent", () => {
  it("appends a student message event and returns it", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    const event   = await service.appendEvent(session.sessionId, {
      role: "student", eventType: "message", content: "x = 2",
    });
    expect(event.role).toBe("student");
    expect(event.content).toBe("x = 2");
  });

  it("appends an assistant message event", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    const event   = await service.appendEvent(session.sessionId, {
      role: "assistant", eventType: "message", content: "Correct!",
    });
    expect(event.role).toBe("assistant");
  });

  it("assigns incrementing seq numbers to consecutive events", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    const event1  = await service.appendEvent(session.sessionId, { role: "student", eventType: "message", content: "a" });
    const event2  = await service.appendEvent(session.sessionId, { role: "assistant", eventType: "message", content: "b" });
    expect(event1.seq).toBe(1);
    expect(event2.seq).toBe(2);
  });

  it("throws when appending to a non-existent session", async () => {
    const service = new SessionService();
    await expect(
      service.appendEvent("nonexistent-session-id", { role: "student", eventType: "message" }),
    ).rejects.toThrow();
  });

  it("stores a null-safe empty string when content is undefined", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    const event   = await service.appendEvent(session.sessionId, {
      role: "student", eventType: "message",
    });
    expect(event.content).toBe("");
  });
});

describe("SessionService.getSessionEvents", () => {
  it("returns an empty array for a session with no events", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    const events  = await service.getSessionEvents(session.sessionId);
    expect(events).toHaveLength(0);
  });

  it("returns all events in insertion order", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    await service.appendEvent(session.sessionId, { role: "student",   eventType: "message", content: "first"  });
    await service.appendEvent(session.sessionId, { role: "assistant", eventType: "message", content: "second" });
    const events = await service.getSessionEvents(session.sessionId);
    expect(events).toHaveLength(2);
    expect(events[0]?.content).toBe("first");
    expect(events[1]?.content).toBe("second");
  });

  it("returns an empty array for an unknown session ID (not an error)", async () => {
    const service = new SessionService();
    const events = await service.getSessionEvents("unknown-session-id");
    expect(events).toHaveLength(0);
  });
});

describe("SessionService.endSession", () => {
  it("marks the session as 'ended'", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    const ended   = await service.endSession(session.sessionId);
    expect(ended.status).toBe("ended");
  });

  it("the same session object reflects 'ended' status after endSession", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    await service.endSession(session.sessionId);
    expect(session.status).toBe("ended"); // same in-memory reference
  });

  it("throws when ending a session that does not exist", async () => {
    const service = new SessionService();
    await expect(service.endSession("nonexistent-id")).rejects.toThrow();
  });

  it("stamps endedAt on the session", async () => {
    const service = new SessionService();
    const session = await service.startSession("student-001", 1);
    await service.endSession(session.sessionId);
    expect(session.endedAt).not.toBeNull();
  });
});
