import { describe, it, expect } from "vitest";
import { appendExchangeTurn, hasExceededFailureBudget } from "./SessionLoopGuards.ts";

// ── appendExchangeTurn ──────────────────────────────────────────────────────

describe("appendExchangeTurn", () => {
  it("appends a Student line followed by a Tutor line", () => {
    const recentExchangeLines: string[] = [];
    appendExchangeTurn(recentExchangeLines, "x = 2", "Correct!", 20);
    expect(recentExchangeLines).toEqual(["Student: x = 2", "Tutor: Correct!"]);
  });

  it("does not trim when the buffer is under the cap", () => {
    const recentExchangeLines: string[] = ["Student: a", "Tutor: b"];
    appendExchangeTurn(recentExchangeLines, "c", "d", 20);
    expect(recentExchangeLines).toEqual(["Student: a", "Tutor: b", "Student: c", "Tutor: d"]);
  });

  it("does not trim when the buffer lands exactly on the cap", () => {
    const recentExchangeLines: string[] = ["Student: a", "Tutor: b"];
    appendExchangeTurn(recentExchangeLines, "c", "d", 4);
    expect(recentExchangeLines).toHaveLength(4);
    expect(recentExchangeLines).toEqual(["Student: a", "Tutor: b", "Student: c", "Tutor: d"]);
  });

  it("trims the oldest turn once the cap is exceeded by one turn", () => {
    const recentExchangeLines: string[] = ["Student: a", "Tutor: b", "Student: c", "Tutor: d"];
    appendExchangeTurn(recentExchangeLines, "e", "f", 4);
    expect(recentExchangeLines).toEqual(["Student: c", "Tutor: d", "Student: e", "Tutor: f"]);
  });

  it("stays bounded at the cap across many repeated calls (unbounded-growth regression)", () => {
    const recentExchangeLines: string[] = [];
    const maxLines = 10;
    for (let attempt = 0; attempt < 500; attempt++) {
      appendExchangeTurn(recentExchangeLines, `attempt-${attempt}`, `reply-${attempt}`, maxLines);
      expect(recentExchangeLines.length).toBeLessThanOrEqual(maxLines);
    }
    // Only the most recent turns survive.
    expect(recentExchangeLines.at(-2)).toBe("Student: attempt-499");
    expect(recentExchangeLines.at(-1)).toBe("Tutor: reply-499");
  });

  it("handles a maxLines of 0 by discarding everything just appended", () => {
    const recentExchangeLines: string[] = [];
    appendExchangeTurn(recentExchangeLines, "a", "b", 0);
    expect(recentExchangeLines).toEqual([]);
  });

  it("mutates the array in place rather than returning a new one", () => {
    const recentExchangeLines: string[] = [];
    const returnValue = appendExchangeTurn(recentExchangeLines, "a", "b", 20);
    expect(returnValue).toBeUndefined();
    expect(recentExchangeLines).toHaveLength(2);
  });
});

// ── hasExceededFailureBudget ─────────────────────────────────────────────────

describe("hasExceededFailureBudget", () => {
  it("is false while failures are below the threshold", () => {
    expect(hasExceededFailureBudget(0, 3)).toBe(false);
    expect(hasExceededFailureBudget(2, 3)).toBe(false);
  });

  it("is true once failures reach the threshold exactly", () => {
    expect(hasExceededFailureBudget(3, 3)).toBe(true);
  });

  it("is true once failures exceed the threshold", () => {
    expect(hasExceededFailureBudget(10, 3)).toBe(true);
  });

  it("treats a threshold of 0 as already exceeded", () => {
    expect(hasExceededFailureBudget(0, 0)).toBe(true);
  });
});
