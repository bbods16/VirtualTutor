import { describe, it, expect } from "vitest";
import {
  computeBktUpdate,
  computeMasteryThreshold,
  BKT_PARAMS,
  TIER3_INFLATED,
  CLAMP_MIN,
  CLAMP_MAX,
  AFFECT_ADJUSTMENT_MULTIPLIER,
  AFFECT_RATE_CAP,
  TIER3_MASTERY_EXTRA_CONSECUTIVE,
  THRESHOLD_FOUNDATIONAL,
  THRESHOLD_DEPENDENT,
  CONSECUTIVE_OPPORTUNITIES,
  STABILITY_SESSIONS,
} from "./BayesianKnowledgeTracing.ts";
import type { BktSkillState, BktParams, KcTier } from "./BayesianKnowledgeTracing.ts";

// ── fixtures ──────────────────────────────────────────────────────────────────

const baseSkillState: BktSkillState = {
  masteryProbability: 0.5,
  slipRate:  0.10,
  guessRate: 0.25,
  successes: 0,
  failures:  0,
};

const identificationParams: BktParams = BKT_PARAMS.identification;

// ── computeBktUpdate ──────────────────────────────────────────────────────────

describe("computeBktUpdate", () => {
  describe("correct observation with no hint and no affect", () => {
    it("increases masteryProbability after a correct answer", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 0 },
        identificationParams,
      );
      expect(result.masteryProbability).toBeGreaterThan(baseSkillState.masteryProbability);
    });

    it("increments successes and leaves failures unchanged", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 0 },
        identificationParams,
      );
      expect(result.successes).toBe(1);
      expect(result.failures).toBe(0);
    });
  });

  describe("incorrect observation with no hint and no affect", () => {
    it("decreases masteryProbability (or at least does not raise it) after wrong answer", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: false, hintTier: 0 },
        identificationParams,
      );
      // After a wrong answer the posterior should be lower than the prior
      // (learning transition can nudge it slightly back up but should remain below prior for typical params)
      expect(result.masteryProbability).toBeLessThan(baseSkillState.masteryProbability);
    });

    it("increments failures and leaves successes unchanged", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: false, hintTier: 0 },
        identificationParams,
      );
      expect(result.failures).toBe(1);
      expect(result.successes).toBe(0);
    });
  });

  describe("Tier-3 hint inflates slip and guess rates", () => {
    it("uses TIER3_INFLATED slip rate when hintTier is 3", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 3 },
        identificationParams,
      );
      expect(result.slipRate).toBe(TIER3_INFLATED.S);
    });

    it("uses TIER3_INFLATED guess rate when hintTier is 3", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 3 },
        identificationParams,
      );
      expect(result.guessRate).toBe(TIER3_INFLATED.G);
    });

    it("Tier-3 correct answer produces lower mastery gain than an unaided correct answer", () => {
      const unaided = computeBktUpdate(baseSkillState, { correct: true, hintTier: 0 }, identificationParams);
      const tier3   = computeBktUpdate(baseSkillState, { correct: true, hintTier: 3 }, identificationParams);
      expect(tier3.masteryProbability).toBeLessThan(unaided.masteryProbability);
    });
  });

  describe("affect adjustments", () => {
    it("frustrated affect inflates the effective slip rate up to AFFECT_RATE_CAP", () => {
      const highSlipParams: BktParams = { ...identificationParams, S: 0.45 };
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 0, affect: "frustrated" },
        highSlipParams,
      );
      // 0.45 * 1.2 = 0.54 → should be capped at 0.5
      expect(result.slipRate).toBe(AFFECT_RATE_CAP);
    });

    it("frustrated affect with low slip rate uses multiplier without hitting cap", () => {
      const lowSlipParams: BktParams = { ...identificationParams, S: 0.10 };
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 0, affect: "frustrated" },
        lowSlipParams,
      );
      // 0.10 * 1.2 = 0.12 — well below cap
      expect(result.slipRate).toBeCloseTo(0.10 * AFFECT_ADJUSTMENT_MULTIPLIER, 5);
    });

    it("bored affect inflates the effective guess rate up to AFFECT_RATE_CAP", () => {
      const highGuessParams: BktParams = { ...identificationParams, G: 0.45 };
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 0, affect: "bored" },
        highGuessParams,
      );
      expect(result.guessRate).toBe(AFFECT_RATE_CAP);
    });

    it("neutral / no affect does not modify slip or guess rates beyond Tier selection", () => {
      const result = computeBktUpdate(
        baseSkillState,
        { correct: true, hintTier: 1, affect: "engaged" },
        identificationParams,
      );
      expect(result.slipRate).toBe(identificationParams.S);
      expect(result.guessRate).toBe(identificationParams.G);
    });
  });

  describe("mastery probability clamping", () => {
    it("result is never below CLAMP_MIN", () => {
      const nearZeroSkill: BktSkillState = { ...baseSkillState, masteryProbability: CLAMP_MIN };
      const result = computeBktUpdate(nearZeroSkill, { correct: false, hintTier: 0 }, identificationParams);
      expect(result.masteryProbability).toBeGreaterThanOrEqual(CLAMP_MIN);
    });

    it("result is never above CLAMP_MAX", () => {
      const nearOneSkill: BktSkillState = { ...baseSkillState, masteryProbability: CLAMP_MAX };
      const result = computeBktUpdate(nearOneSkill, { correct: true, hintTier: 0 }, identificationParams);
      expect(result.masteryProbability).toBeLessThanOrEqual(CLAMP_MAX);
    });
  });

  describe("all KC tiers respond to correct/incorrect", () => {
    const tiers: KcTier[] = ["identification", "interpretation", "translation", "application"];

    for (const tier of tiers) {
      it(`${tier} — correct answer raises mastery`, () => {
        const result = computeBktUpdate(
          { ...baseSkillState, masteryProbability: 0.3 },
          { correct: true, hintTier: 1 },
          BKT_PARAMS[tier],
        );
        expect(result.masteryProbability).toBeGreaterThan(0.3);
      });
    }
  });

  describe("successive correct answers converge toward CLAMP_MAX", () => {
    it("mastery approaches 1 after many correct answers", () => {
      let state = baseSkillState;
      for (let turn = 0; turn < 50; turn++) {
        state = computeBktUpdate(state, { correct: true, hintTier: 0 }, identificationParams);
      }
      expect(state.masteryProbability).toBeGreaterThan(0.99);
    });
  });
});

// ── computeMasteryThreshold ───────────────────────────────────────────────────

describe("computeMasteryThreshold", () => {
  const masteredFoundationalSkill: BktSkillState = {
    masteryProbability: THRESHOLD_FOUNDATIONAL,
    slipRate: 0.10, guessRate: 0.25, successes: 10, failures: 1,
  };

  const masteredDependentSkill: BktSkillState = {
    masteryProbability: THRESHOLD_DEPENDENT,
    slipRate: 0.12, guessRate: 0.15, successes: 8, failures: 2,
  };

  const stableHistory = {
    consecutiveAtMastery:   CONSECUTIVE_OPPORTUNITIES,
    sessionsAboveThreshold: STABILITY_SESSIONS,
    tier3Supported: false,
  };

  describe("threshold selection by KC tier", () => {
    it("uses THRESHOLD_FOUNDATIONAL (0.80) for identification tier", () => {
      const { thresholdUsed } = computeMasteryThreshold(masteredFoundationalSkill, "identification", stableHistory);
      expect(thresholdUsed).toBe(THRESHOLD_FOUNDATIONAL);
    });

    it("uses THRESHOLD_FOUNDATIONAL (0.80) for interpretation tier", () => {
      const { thresholdUsed } = computeMasteryThreshold(masteredFoundationalSkill, "interpretation", stableHistory);
      expect(thresholdUsed).toBe(THRESHOLD_FOUNDATIONAL);
    });

    it("uses THRESHOLD_DEPENDENT (0.75) for translation tier", () => {
      const { thresholdUsed } = computeMasteryThreshold(masteredDependentSkill, "translation", stableHistory);
      expect(thresholdUsed).toBe(THRESHOLD_DEPENDENT);
    });

    it("uses THRESHOLD_DEPENDENT (0.75) for application tier", () => {
      const { thresholdUsed } = computeMasteryThreshold(masteredDependentSkill, "application", stableHistory);
      expect(thresholdUsed).toBe(THRESHOLD_DEPENDENT);
    });
  });

  describe("mastered flag", () => {
    it("mastered is true when probability meets the foundational threshold exactly", () => {
      const { mastered } = computeMasteryThreshold(masteredFoundationalSkill, "identification", stableHistory);
      expect(mastered).toBe(true);
    });

    it("mastered is false when probability is just below the threshold", () => {
      const justBelow: BktSkillState = { ...masteredFoundationalSkill, masteryProbability: THRESHOLD_FOUNDATIONAL - 0.001 };
      const { mastered } = computeMasteryThreshold(justBelow, "identification", stableHistory);
      expect(mastered).toBe(false);
    });
  });

  describe("gateOpen flag", () => {
    it("gate opens when mastery, consecutive opportunities, and sessions all meet criteria", () => {
      const { gateOpen } = computeMasteryThreshold(masteredFoundationalSkill, "identification", stableHistory);
      expect(gateOpen).toBe(true);
    });

    it("gate stays closed when mastery is sufficient but consecutiveAtMastery is too low", () => {
      const insufficientConsecutive = { ...stableHistory, consecutiveAtMastery: CONSECUTIVE_OPPORTUNITIES - 1 };
      const { gateOpen } = computeMasteryThreshold(masteredFoundationalSkill, "identification", insufficientConsecutive);
      expect(gateOpen).toBe(false);
    });

    it("gate stays closed when mastery is sufficient but sessionsAboveThreshold is too low", () => {
      const insufficientSessions = { ...stableHistory, sessionsAboveThreshold: STABILITY_SESSIONS - 1 };
      const { gateOpen } = computeMasteryThreshold(masteredFoundationalSkill, "identification", insufficientSessions);
      expect(gateOpen).toBe(false);
    });

    it("gate stays closed when skill is not yet mastered, regardless of history", () => {
      const notMastered: BktSkillState = { ...masteredFoundationalSkill, masteryProbability: 0.50 };
      const { gateOpen } = computeMasteryThreshold(notMastered, "identification", stableHistory);
      expect(gateOpen).toBe(false);
    });
  });

  describe("Tier-3-supported mastery requires extra consecutive opportunity", () => {
    it("gate stays closed with normal CONSECUTIVE_OPPORTUNITIES when tier3Supported is true", () => {
      const tier3History = { ...stableHistory, tier3Supported: true };
      const { gateOpen } = computeMasteryThreshold(masteredFoundationalSkill, "identification", tier3History);
      // Needs CONSECUTIVE_OPPORTUNITIES + TIER3_MASTERY_EXTRA_CONSECUTIVE
      expect(gateOpen).toBe(false);
    });

    it("gate opens when consecutive count covers the extra Tier-3 requirement", () => {
      const tier3History = {
        consecutiveAtMastery: CONSECUTIVE_OPPORTUNITIES + TIER3_MASTERY_EXTRA_CONSECUTIVE,
        sessionsAboveThreshold: STABILITY_SESSIONS,
        tier3Supported: true,
      };
      const { gateOpen } = computeMasteryThreshold(masteredFoundationalSkill, "identification", tier3History);
      expect(gateOpen).toBe(true);
    });
  });

  describe("exported constant integrity", () => {
    it("TIER3_MASTERY_EXTRA_CONSECUTIVE is a positive integer", () => {
      expect(TIER3_MASTERY_EXTRA_CONSECUTIVE).toBeGreaterThan(0);
      expect(Number.isInteger(TIER3_MASTERY_EXTRA_CONSECUTIVE)).toBe(true);
    });

    it("CLAMP_MIN is strictly less than CLAMP_MAX", () => {
      expect(CLAMP_MIN).toBeLessThan(CLAMP_MAX);
    });

    it("THRESHOLD_FOUNDATIONAL is strictly greater than THRESHOLD_DEPENDENT", () => {
      expect(THRESHOLD_FOUNDATIONAL).toBeGreaterThan(THRESHOLD_DEPENDENT);
    });
  });
});
