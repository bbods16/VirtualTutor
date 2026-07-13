import { describe, it, expect } from "vitest";
import { LearningProfileStore, PREREQUISITE_MASTERY_THRESHOLD } from "./LearningProfileStore.ts";
import type { CognitiveState, BehavioralState, HistoricalState } from "./LearningProfileStore.ts";
import { ProfilePatch } from "./ProfilePatch.ts";
import type { PatchOperation } from "./ProfilePatch.ts";

// ── fixtures ──────────────────────────────────────────────────────────────────

function buildCognitiveState(masteryOverrides: Record<string, number> = {}): CognitiveState {
  const defaultMastery = 0.5;
  return {
    skills: {
      "linear-equations": {
        masteryProbability: masteryOverrides["linear-equations"] ?? defaultMastery,
        slipRate: 0.1,
        guessRate: 0.25,
        difficulty: 0.5,
        stability: 1.0,
        lastReviewDate: new Date(),
        dueForReview: false,
        knowledgeComponents: {
          "KC-01": { kcId: "KC-01", kcName: "Variable Identification", masteryScore: 0.5, exposureCount: 2 },
        },
      },
      "slope-intercept": {
        masteryProbability: masteryOverrides["slope-intercept"] ?? defaultMastery,
        slipRate: 0.12,
        guessRate: 0.15,
        difficulty: 0.6,
        stability: 1.0,
        lastReviewDate: new Date(),
        dueForReview: false,
        knowledgeComponents: {},
      },
    },
    misconceptions: [
      { id: "sign-error", confidenceScore: 0.75 },
      { id: "distribution-error", confidenceScore: 0.45 },
    ],
    metacognition: {
      selfReportConfidenceCalibration: 0.5,
      helpSeeking: "optimal",
      persistence: 0.5,
    },
  };
}

function buildBehavioralState(): BehavioralState {
  return {
    frustrationIndex: 0.0,
    scaffoldingLevel: "NONE",
    socraticRatio: 1.0,
    answerRevealPolicy: "AFTER_3_ATTEMPTS",
    failedAttemptsCounter: 0,
  };
}

function buildHistoricalState(): HistoricalState {
  return {
    pastGoals: [],
    totalQuestionsAnswered: 0,
    masteredSkillIds: [],
  };
}

function buildStore(masteryOverrides: Record<string, number> = {}): LearningProfileStore {
  return new LearningProfileStore({
    id: "test-profile-id",
    student_id: "test-student-id",
    cognitive: buildCognitiveState(masteryOverrides),
    behavioral: buildBehavioralState(),
    historical: buildHistoricalState(),
    tone_notes: "",
    profileVersion: 1,
  });
}

function buildPatch(operations: PatchOperation[], baseVersion = 1): ProfilePatch {
  return new ProfilePatch({
    id: "patch-001",
    sessionId: "session-001",
    studentId: "test-student-id",
    baseProfileVersion: baseVersion,
    newProfileVersion: baseVersion + 1,
    sessionSummary: "test patch",
    operations,
  });
}

// ── applyPatch ────────────────────────────────────────────────────────────────

describe("LearningProfileStore.applyPatch", () => {
  describe("update_mastery operations", () => {
    it("applies a positive mastery delta to the target skill", () => {
      const store = buildStore({ "linear-equations": 0.5 });
      const patch = buildPatch([
        { op: "update_mastery", skillId: "linear-equations", masteryDelta: 0.1, confidence: 0.8, evidenceRefs: [] },
      ]);
      store.applyPatch(patch);
      const updatedSkill = store.getSkillState("linear-equations");
      expect(updatedSkill?.masteryProbability).toBeCloseTo(0.6, 5);
    });

    it("applies a negative mastery delta to the target skill", () => {
      const store = buildStore({ "linear-equations": 0.5 });
      const patch = buildPatch([
        { op: "update_mastery", skillId: "linear-equations", masteryDelta: -0.15, confidence: 0.7, evidenceRefs: [] },
      ]);
      store.applyPatch(patch);
      const updatedSkill = store.getSkillState("linear-equations");
      expect(updatedSkill?.masteryProbability).toBeCloseTo(0.35, 5);
    });

    it("clamps mastery to a minimum of 0.0001 after a large negative delta", () => {
      const store = buildStore({ "linear-equations": 0.05 });
      const patch = buildPatch([
        { op: "update_mastery", skillId: "linear-equations", masteryDelta: -0.99, confidence: 0.5, evidenceRefs: [] },
      ]);
      store.applyPatch(patch);
      const updatedSkill = store.getSkillState("linear-equations");
      expect(updatedSkill?.masteryProbability).toBeGreaterThanOrEqual(0.0001);
    });

    it("clamps mastery to a maximum of 0.9999 after a large positive delta", () => {
      const store = buildStore({ "linear-equations": 0.95 });
      const patch = buildPatch([
        { op: "update_mastery", skillId: "linear-equations", masteryDelta: 0.99, confidence: 0.9, evidenceRefs: [] },
      ]);
      store.applyPatch(patch);
      const updatedSkill = store.getSkillState("linear-equations");
      expect(updatedSkill?.masteryProbability).toBeLessThanOrEqual(0.9999);
    });

    it("silently ignores update_mastery for a skill that does not exist in the profile", () => {
      const store = buildStore();
      const patch = buildPatch([
        { op: "update_mastery", skillId: "nonexistent-skill", masteryDelta: 0.2, confidence: 0.6, evidenceRefs: [] },
      ]);
      expect(() => store.applyPatch(patch)).not.toThrow();
    });

    it("applies multiple operations in a single patch", () => {
      const store = buildStore({ "linear-equations": 0.4, "slope-intercept": 0.3 });
      const patch = buildPatch([
        { op: "update_mastery", skillId: "linear-equations", masteryDelta: 0.1, confidence: 0.8, evidenceRefs: [] },
        { op: "update_mastery", skillId: "slope-intercept",  masteryDelta: 0.05, confidence: 0.7, evidenceRefs: [] },
      ]);
      store.applyPatch(patch);
      expect(store.getSkillState("linear-equations")?.masteryProbability).toBeCloseTo(0.5, 5);
      expect(store.getSkillState("slope-intercept")?.masteryProbability).toBeCloseTo(0.35, 5);
    });
  });

  describe("profileVersion bump", () => {
    it("bumps profileVersion to patch.newProfileVersion after applying", () => {
      const store = buildStore();
      const patch = buildPatch([], 1); // base 1 → new 2
      store.applyPatch(patch);
      expect(store.profileVersion).toBe(2);
    });

    it("updates profileVersion even when operations list is empty", () => {
      const store = buildStore();
      const emptyPatch = buildPatch([], 1);
      store.applyPatch(emptyPatch);
      expect(store.profileVersion).toBe(2);
    });
  });

  describe("update_behavioral operations", () => {
    it("updates a top-level behavioral field via dot-path", () => {
      const store = buildStore();
      const patch = buildPatch([
        { op: "update_behavioral", path: "frustrationIndex", value: 0.8, confidence: 1.0, evidenceRefs: [] },
      ]);
      store.applyPatch(patch);
      expect(store.behavioral.frustrationIndex).toBe(0.8);
    });
  });
});

// ── checkPrerequisiteGate ─────────────────────────────────────────────────────

describe("LearningProfileStore.checkPrerequisiteGate", () => {
  it("returns true when skill mastery meets PREREQUISITE_MASTERY_THRESHOLD exactly", () => {
    const store = buildStore({ "linear-equations": PREREQUISITE_MASTERY_THRESHOLD });
    expect(store.checkPrerequisiteGate("linear-equations")).toBe(true);
  });

  it("returns true when skill mastery exceeds PREREQUISITE_MASTERY_THRESHOLD", () => {
    const store = buildStore({ "linear-equations": PREREQUISITE_MASTERY_THRESHOLD + 0.1 });
    expect(store.checkPrerequisiteGate("linear-equations")).toBe(true);
  });

  it("returns false when skill mastery is just below PREREQUISITE_MASTERY_THRESHOLD", () => {
    const store = buildStore({ "linear-equations": PREREQUISITE_MASTERY_THRESHOLD - 0.001 });
    expect(store.checkPrerequisiteGate("linear-equations")).toBe(false);
  });

  it("returns false when skill mastery is well below threshold", () => {
    const store = buildStore({ "linear-equations": 0.2 });
    expect(store.checkPrerequisiteGate("linear-equations")).toBe(false);
  });

  it("returns false for a skill ID that does not exist in the profile", () => {
    const store = buildStore();
    expect(store.checkPrerequisiteGate("nonexistent-skill")).toBe(false);
  });

  describe("PREREQUISITE_MASTERY_THRESHOLD constant", () => {
    it("is 0.75 (flags.MD flag 1 value)", () => {
      expect(PREREQUISITE_MASTERY_THRESHOLD).toBe(0.75);
    });
  });
});

// ── adjustFrustration ─────────────────────────────────────────────────────────

describe("LearningProfileStore.adjustFrustration", () => {
  it("clamps frustrationIndex to a maximum of 1.0", () => {
    const store = buildStore();
    store.adjustFrustration(1.5);
    expect(store.behavioral.frustrationIndex).toBe(1.0);
  });

  it("clamps frustrationIndex to a minimum of 0.0", () => {
    const store = buildStore();
    store.adjustFrustration(-1.5);
    expect(store.behavioral.frustrationIndex).toBe(0.0);
  });

  it("escalates scaffoldingLevel to HIGH and socraticRatio to 0.0 once frustration exceeds 0.75", () => {
    const store = buildStore();
    store.adjustFrustration(0.8);
    expect(store.behavioral.scaffoldingLevel).toBe("HIGH");
    expect(store.behavioral.socraticRatio).toBe(0.0);
  });

  it("does not escalate when frustration is exactly 0.75 (boundary is exclusive)", () => {
    const store = buildStore();
    store.adjustFrustration(0.75);
    expect(store.behavioral.scaffoldingLevel).toBe("NONE");
  });

  it("reverts scaffoldingLevel/socraticRatio back to neutral once frustration decays back under 0.75", () => {
    // DSR audit finding: the HIGH latch previously never reversed, trapping a calmed-down
    // student in maximum scaffolding/direct-only tone for the rest of the session.
    const store = buildStore();
    store.adjustFrustration(0.9); // escalate to HIGH
    expect(store.behavioral.scaffoldingLevel).toBe("HIGH");

    store.adjustFrustration(-0.5); // frustrationIndex now 0.4 — back under threshold
    expect(store.behavioral.frustrationIndex).toBeCloseTo(0.4, 5);
    expect(store.behavioral.scaffoldingLevel).toBe("NONE");
    expect(store.behavioral.socraticRatio).toBe(1.0);
  });

  it("leaves scaffoldingLevel alone when it was never escalated to HIGH in the first place", () => {
    const store = buildStore();
    store.adjustFrustration(0.1); // stays well under threshold, never escalates
    expect(store.behavioral.scaffoldingLevel).toBe("NONE");
    expect(store.behavioral.socraticRatio).toBe(1.0);
  });
});

// ── recordFailedAttempt / resetAttemptCounter ────────────────────────────────

describe("LearningProfileStore.recordFailedAttempt", () => {
  it("increments failedAttemptsCounter on each call", () => {
    const store = buildStore();
    store.recordFailedAttempt();
    store.recordFailedAttempt();
    expect(store.behavioral.failedAttemptsCounter).toBe(2);
  });

  it("returns false before the AFTER_3_ATTEMPTS threshold is reached", () => {
    const store = buildStore();
    expect(store.recordFailedAttempt()).toBe(false);
    expect(store.recordFailedAttempt()).toBe(false);
  });

  it("returns true and escalates scaffolding once failedAttemptsCounter reaches 3 under AFTER_3_ATTEMPTS", () => {
    // DSR audit finding: this branch previously existed but had an empty body — the reveal
    // policy was checked but never actually triggered anything.
    const store = buildStore();
    store.recordFailedAttempt();
    store.recordFailedAttempt();
    const answerShouldBeRevealed = store.recordFailedAttempt();
    expect(answerShouldBeRevealed).toBe(true);
    expect(store.behavioral.scaffoldingLevel).toBe("HIGH");
    expect(store.behavioral.socraticRatio).toBe(0.0);
  });

  it("never returns true when answerRevealPolicy is not AFTER_3_ATTEMPTS", () => {
    const store = new LearningProfileStore({
      id: "test-profile-id",
      student_id: "test-student-id",
      cognitive: buildCognitiveState(),
      behavioral: { ...buildBehavioralState(), answerRevealPolicy: "NEVER" },
      historical: buildHistoricalState(),
      tone_notes: "",
      profileVersion: 1,
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(store.recordFailedAttempt()).toBe(false);
    }
  });
});

describe("LearningProfileStore.resetAttemptCounter", () => {
  it("resets failedAttemptsCounter to 0 without touching frustrationIndex or scaffoldingLevel", () => {
    // DSR audit finding: failedAttemptsCounter previously persisted across problems for the
    // entire session lifetime with no reset path, polluting state across problem variations.
    const store = buildStore();
    store.recordFailedAttempt();
    store.recordFailedAttempt();
    store.adjustFrustration(0.9);
    expect(store.behavioral.failedAttemptsCounter).toBe(2);

    store.resetAttemptCounter();

    expect(store.behavioral.failedAttemptsCounter).toBe(0);
    expect(store.behavioral.frustrationIndex).toBeCloseTo(0.9, 5);
    expect(store.behavioral.scaffoldingLevel).toBe("HIGH");
  });
});
