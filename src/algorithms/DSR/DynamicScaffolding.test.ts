import { describe, it, expect } from "vitest";
import {
  selectSocraticTier,
  computeScaffoldingAndTone,
  detectStuckLoop,
  FRUSTRATION_HIGH,
  MIN_ATTEMPTS_BEFORE_HINT,
  MAX_ATTEMPTS_BEFORE_FRUSTRATION,
  STANDARD_DELTA_MAX,
  TIER3_DELTA_MAX,
  CONSECUTIVE_SESSION_FLAG,
  MASTERY_FADED_SCAFFOLDING_THRESHOLD,
  MASTERY_ANALYTICAL_TONE_THRESHOLD,
  SOCRATIC_RATIO_DIRECT,
  SOCRATIC_RATIO_FADED,
  SOCRATIC_RATIO_FULL,
  MIN_SOCRATIC_TIER,
  MAX_SOCRATIC_TIER,
} from "./DynamicScaffolding.ts";
import type { SessionFeedbackSummary } from "./DynamicScaffolding.ts";

// ── selectSocraticTier ────────────────────────────────────────────────────────

describe("selectSocraticTier", () => {
  const defaultSignals = {
    masteryProbability: 0.5,
    frustrationIndex: 0.2,
    errorType: "procedural" as const,
  };

  describe("first attempt (tier 0 — problem just started)", () => {
    it("returns Tier 1 and no hint on the first attempt", () => {
      const result = selectSocraticTier(
        { tier: 0, attemptsThisStep: 1, stuck: false },
        defaultSignals,
      );
      expect(result.tier).toBe(MIN_SOCRATIC_TIER);
      expect(result.deliverHint).toBe(false);
    });

    it("masteryDeltaCap is STANDARD_DELTA_MAX on first attempt", () => {
      const result = selectSocraticTier(
        { tier: 0, attemptsThisStep: 1, stuck: false },
        defaultSignals,
      );
      expect(result.masteryDeltaCap).toBe(STANDARD_DELTA_MAX);
    });
  });

  describe("productive-struggle window — no escalation yet", () => {
    it("stays at Tier 1 when attempts are within the struggle window and student is not stuck", () => {
      const result = selectSocraticTier(
        { tier: 1, attemptsThisStep: MIN_ATTEMPTS_BEFORE_HINT, stuck: false },
        defaultSignals,
      );
      expect(result.tier).toBe(1);
      expect(result.deliverHint).toBe(false);
    });
  });

  describe("escalation on too many failed attempts", () => {
    it("escalates to Tier 2 when attemptsThisStep exceeds MAX_ATTEMPTS_BEFORE_FRUSTRATION", () => {
      const result = selectSocraticTier(
        { tier: 1, attemptsThisStep: MAX_ATTEMPTS_BEFORE_FRUSTRATION + 1, stuck: false },
        defaultSignals,
      );
      expect(result.tier).toBe(2);
      expect(result.deliverHint).toBe(true);
    });

    it("escalates to Tier 3 when already at Tier 2 and still exceeding attempt threshold", () => {
      const result = selectSocraticTier(
        { tier: 2, attemptsThisStep: MAX_ATTEMPTS_BEFORE_FRUSTRATION + 1, stuck: false },
        defaultSignals,
      );
      expect(result.tier).toBe(MAX_SOCRATIC_TIER);
    });

    it("does not exceed MAX_SOCRATIC_TIER (3) even when already at Tier 3", () => {
      const result = selectSocraticTier(
        { tier: 3, attemptsThisStep: MAX_ATTEMPTS_BEFORE_FRUSTRATION + 1, stuck: false },
        defaultSignals,
      );
      expect(result.tier).toBe(MAX_SOCRATIC_TIER);
    });
  });

  describe("escalation when student is stuck", () => {
    it("escalates to Tier 2 when stuck and attempts exceed MIN_ATTEMPTS_BEFORE_HINT", () => {
      const result = selectSocraticTier(
        { tier: 1, attemptsThisStep: MIN_ATTEMPTS_BEFORE_HINT + 1, stuck: true },
        defaultSignals,
      );
      expect(result.tier).toBe(2);
    });

    it("does not escalate when stuck but attempts are still within the struggle window", () => {
      const result = selectSocraticTier(
        { tier: 1, attemptsThisStep: MIN_ATTEMPTS_BEFORE_HINT, stuck: true },
        defaultSignals,
      );
      expect(result.tier).toBe(1);
    });
  });

  describe("high-frustration override", () => {
    const frustratedSignals = { ...defaultSignals, frustrationIndex: FRUSTRATION_HIGH };

    it("escalates immediately when frustration reaches FRUSTRATION_HIGH", () => {
      const result = selectSocraticTier(
        { tier: 1, attemptsThisStep: 1, stuck: false },
        frustratedSignals,
      );
      expect(result.tier).toBeGreaterThan(1);
      expect(result.deliverHint).toBe(true);
    });

    it("escalates even on the first attempt when frustration is high", () => {
      const result = selectSocraticTier(
        { tier: 0, attemptsThisStep: 1, stuck: false },
        frustratedSignals,
      );
      expect(result.tier).toBeGreaterThan(MIN_SOCRATIC_TIER);
    });
  });

  describe("Tier-3 mastery delta cap", () => {
    it("masteryDeltaCap is TIER3_DELTA_MAX when the resulting tier is Tier 3", () => {
      const result = selectSocraticTier(
        { tier: 2, attemptsThisStep: MAX_ATTEMPTS_BEFORE_FRUSTRATION + 1, stuck: false },
        defaultSignals,
      );
      expect(result.tier).toBe(MAX_SOCRATIC_TIER);
      expect(result.masteryDeltaCap).toBe(TIER3_DELTA_MAX);
    });

    it("masteryDeltaCap is STANDARD_DELTA_MAX when tier is below Tier 3", () => {
      const result = selectSocraticTier(
        { tier: 1, attemptsThisStep: MAX_ATTEMPTS_BEFORE_FRUSTRATION + 1, stuck: false },
        defaultSignals,
      );
      if (result.tier < MAX_SOCRATIC_TIER) {
        expect(result.masteryDeltaCap).toBe(STANDARD_DELTA_MAX);
      }
    });
  });
});

// ── computeScaffoldingAndTone ─────────────────────────────────────────────────

describe("computeScaffoldingAndTone", () => {
  describe("scaffolding level based on frustration", () => {
    it("sets scaffolding to 'high' when frustrationIndex meets FRUSTRATION_HIGH threshold", () => {
      const result = computeScaffoldingAndTone(0.5, FRUSTRATION_HIGH, "optimal");
      expect(result.scaffoldingLevel).toBe("high");
    });

    it("sets socraticRatio to SOCRATIC_RATIO_DIRECT (0.0) when frustration is high", () => {
      const result = computeScaffoldingAndTone(0.5, FRUSTRATION_HIGH, "optimal");
      expect(result.socraticRatio).toBe(SOCRATIC_RATIO_DIRECT);
    });
  });

  describe("scaffolding level based on mastery (normal frustration)", () => {
    it("sets scaffolding to 'faded' when mastery is below MASTERY_FADED_SCAFFOLDING_THRESHOLD", () => {
      const result = computeScaffoldingAndTone(MASTERY_FADED_SCAFFOLDING_THRESHOLD - 0.01, 0.0, "optimal");
      expect(result.scaffoldingLevel).toBe("faded");
    });

    it("sets socraticRatio to SOCRATIC_RATIO_FADED when scaffolding is 'faded'", () => {
      const result = computeScaffoldingAndTone(MASTERY_FADED_SCAFFOLDING_THRESHOLD - 0.01, 0.0, "optimal");
      expect(result.socraticRatio).toBe(SOCRATIC_RATIO_FADED);
    });

    it("sets scaffolding to 'none' when mastery meets threshold and frustration is low", () => {
      const result = computeScaffoldingAndTone(MASTERY_FADED_SCAFFOLDING_THRESHOLD, 0.0, "optimal");
      expect(result.scaffoldingLevel).toBe("none");
    });

    it("sets socraticRatio to SOCRATIC_RATIO_FULL when scaffolding is 'none'", () => {
      const result = computeScaffoldingAndTone(MASTERY_FADED_SCAFFOLDING_THRESHOLD, 0.0, "optimal");
      expect(result.socraticRatio).toBe(SOCRATIC_RATIO_FULL);
    });

    it("frustration takes priority over mastery for scaffolding level", () => {
      // High mastery but also high frustration — frustration wins
      const result = computeScaffoldingAndTone(0.9, FRUSTRATION_HIGH, "optimal");
      expect(result.scaffoldingLevel).toBe("high");
    });
  });

  describe("feedback timing", () => {
    it("returns 'immediate' feedback for avoidant help-seeking style", () => {
      const result = computeScaffoldingAndTone(0.5, 0.2, "avoidant");
      expect(result.feedbackTiming).toBe("immediate");
    });

    it("returns 'delayed' feedback for optimal help-seeking style", () => {
      const result = computeScaffoldingAndTone(0.5, 0.2, "optimal");
      expect(result.feedbackTiming).toBe("delayed");
    });

    it("returns 'delayed' feedback for dependent help-seeking style", () => {
      const result = computeScaffoldingAndTone(0.5, 0.2, "dependent");
      expect(result.feedbackTiming).toBe("delayed");
    });
  });

  describe("tone override", () => {
    it("sets toneOverride to 'encouraging' when frustrated", () => {
      const result = computeScaffoldingAndTone(0.5, FRUSTRATION_HIGH, "optimal");
      expect(result.toneOverride).toBe("encouraging");
    });

    it("sets toneOverride to 'direct' for avoidant help-seeking (non-frustrated)", () => {
      const result = computeScaffoldingAndTone(0.5, 0.2, "avoidant");
      expect(result.toneOverride).toBe("direct");
    });

    it("sets toneOverride to 'analytical' for high-mastery, non-avoidant, non-frustrated student", () => {
      const result = computeScaffoldingAndTone(MASTERY_ANALYTICAL_TONE_THRESHOLD + 0.01, 0.1, "optimal");
      expect(result.toneOverride).toBe("analytical");
    });

    it("does not set toneOverride for mid-mastery, non-avoidant, non-frustrated student", () => {
      const result = computeScaffoldingAndTone(0.5, 0.2, "optimal");
      expect(result.toneOverride).toBeUndefined();
    });

    it("frustrated tone override takes priority over avoidant tone override", () => {
      const result = computeScaffoldingAndTone(0.5, FRUSTRATION_HIGH, "avoidant");
      expect(result.toneOverride).toBe("encouraging");
    });
  });
});

// ── detectStuckLoop ───────────────────────────────────────────────────────────

describe("detectStuckLoop", () => {
  const productiveSession: SessionFeedbackSummary = { loopType: "productive", repeatedError: false, engagementDropped: false };
  const stuckSession:      SessionFeedbackSummary = { loopType: "stuck",      repeatedError: true,  engagementDropped: true  };
  const avoidantSession:   SessionFeedbackSummary = { loopType: "avoidant",   repeatedError: false, engagementDropped: true  };

  describe("insufficient history", () => {
    it("returns 'productive' with no flag when there are fewer sessions than CONSECUTIVE_SESSION_FLAG", () => {
      const result = detectStuckLoop([stuckSession, stuckSession]);
      expect(result.loopType).toBe("productive");
      expect(result.sessionFlag).toBe(false);
    });

    it("returns 'productive' with no flag for an empty session list", () => {
      const result = detectStuckLoop([]);
      expect(result.loopType).toBe("productive");
      expect(result.sessionFlag).toBe(false);
    });
  });

  describe("unanimous stuck pattern", () => {
    it("returns loopType 'stuck' and sessionFlag true when all last N sessions are stuck", () => {
      const sessions = Array(CONSECUTIVE_SESSION_FLAG).fill(stuckSession) as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("stuck");
      expect(result.sessionFlag).toBe(true);
    });

    it("uses only the last CONSECUTIVE_SESSION_FLAG sessions — older sessions do not prevent the flag", () => {
      const sessions = [productiveSession, ...Array(CONSECUTIVE_SESSION_FLAG).fill(stuckSession)] as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("stuck");
      expect(result.sessionFlag).toBe(true);
    });
  });

  describe("unanimous avoidant pattern", () => {
    it("returns loopType 'avoidant' and sessionFlag true when all last N sessions are avoidant", () => {
      const sessions = Array(CONSECUTIVE_SESSION_FLAG).fill(avoidantSession) as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("avoidant");
      expect(result.sessionFlag).toBe(true);
    });
  });

  describe("majority vote (no unanimous pattern)", () => {
    it("returns 'stuck' with no flag when stuck sessions outnumber avoidant", () => {
      const sessions = [stuckSession, stuckSession, avoidantSession] as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("stuck");
      expect(result.sessionFlag).toBe(false);
    });

    it("returns 'avoidant' with no flag when avoidant sessions outnumber stuck", () => {
      const sessions = [avoidantSession, avoidantSession, stuckSession] as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("avoidant");
      expect(result.sessionFlag).toBe(false);
    });

    it("returns 'productive' with no flag when stuck and avoidant counts are tied", () => {
      // 3-session window: 1 stuck, 1 avoidant, 1 productive → tied → productive
      const sessions = [stuckSession, avoidantSession, productiveSession] as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("productive");
      expect(result.sessionFlag).toBe(false);
    });
  });

  describe("productive sessions never raise the flag", () => {
    it("returns 'productive' with no flag for all-productive sessions", () => {
      const sessions = Array(CONSECUTIVE_SESSION_FLAG).fill(productiveSession) as SessionFeedbackSummary[];
      const result = detectStuckLoop(sessions);
      expect(result.loopType).toBe("productive");
      expect(result.sessionFlag).toBe(false);
    });
  });
});
