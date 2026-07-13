import { describe, it, expect } from "vitest";
import { ProfileService } from "./ProfileService.ts";
import { IntakeQuiz } from "@domain/intake/IntakeQuiz.ts";
import { ProfilePatch } from "@domain/profile/ProfilePatch.ts";
import { BKT_PARAMS } from "@algorithms/BKT/BayesianKnowledgeTracing.ts";

// ── fixtures ──────────────────────────────────────────────────────────────────

function buildQuiz(responses: Record<string, unknown> = {}): IntakeQuiz {
  return new IntakeQuiz({
    id:           crypto.randomUUID(),
    student_id:   "student-build-test",
    raw_responses: { gradeLevel: 9, locale: "en-US", ...responses },
    rag_output:   "",
  });
}

// ── ProfileService ────────────────────────────────────────────────────────────

describe("ProfileService.getProfile", () => {
  it("returns null for a student who has no profile yet", async () => {
    const service = new ProfileService();
    const result = await service.getProfile("unknown-student");
    expect(result).toBeNull();
  });

  it("returns the profile after it has been built", async () => {
    const service = new ProfileService();
    const quiz    = buildQuiz();
    await service.buildInitialProfile(quiz);
    const result  = await service.getProfile(quiz.student_id);
    expect(result).not.toBeNull();
    expect(result?.student_id).toBe(quiz.student_id);
  });
});

describe("ProfileService.buildInitialProfile", () => {
  it("creates a LearningProfileStore with the correct student_id", async () => {
    const service = new ProfileService();
    const quiz    = buildQuiz();
    const profile = await service.buildInitialProfile(quiz);
    expect(profile.student_id).toBe(quiz.student_id);
  });

  it("seeds masteryProbability from BKT_PARAMS.identification.L0 for linear-equations", async () => {
    const service = new ProfileService();
    const profile = await service.buildInitialProfile(buildQuiz());
    const skill   = profile.getSkillState("linear-equations");
    expect(skill?.masteryProbability).toBe(BKT_PARAMS.identification.L0);
  });

  it("seeds masteryProbability from BKT_PARAMS.interpretation.L0 for slope-intercept", async () => {
    const service = new ProfileService();
    const profile = await service.buildInitialProfile(buildQuiz());
    const skill   = profile.getSkillState("slope-intercept");
    expect(skill?.masteryProbability).toBe(BKT_PARAMS.interpretation.L0);
  });

  it("sets profileVersion to 1 on a new profile", async () => {
    const service = new ProfileService();
    const profile = await service.buildInitialProfile(buildQuiz());
    expect(profile.profileVersion).toBe(1);
  });

  it("extracts gradeLevel from quiz raw_responses", async () => {
    const service = new ProfileService();
    const profile = await service.buildInitialProfile(buildQuiz({ gradeLevel: "higher_ed" }));
    expect(profile.gradeLevel).toBe("higher_ed");
  });

  it("extracts locale from quiz raw_responses", async () => {
    const service = new ProfileService();
    const profile = await service.buildInitialProfile(buildQuiz({ locale: "fr-CA" }));
    expect(profile.locale).toBe("fr-CA");
  });

  it("falls back to default gradeLevel when not in quiz responses", async () => {
    const service = new ProfileService();
    const quizWithoutGrade = new IntakeQuiz({
      id: crypto.randomUUID(), student_id: "student-x",
      raw_responses: {}, rag_output: "",
    });
    const profile = await service.buildInitialProfile(quizWithoutGrade);
    expect(profile.gradeLevel).toBe(9); // DEFAULT_GRADE_LEVEL
  });

  it("stores the quiz ID in generatedFrom", async () => {
    const service = new ProfileService();
    const quiz    = buildQuiz();
    const profile = await service.buildInitialProfile(quiz);
    expect(profile.generatedFrom?.["intakeQuizId"]).toBe(quiz.id);
  });

  it("stores accessibility preferences extracted from quiz in generatedFrom", async () => {
    const service = new ProfileService();
    const profile = await service.buildInitialProfile(
      buildQuiz({ readingLevelAdjustment: "simplified", cognitiveLoadLimit: "low" }),
    );
    const accessibility = profile.generatedFrom?.["accessibility"] as Record<string, unknown>;
    expect(accessibility?.["readingLevelAdjustment"]).toBe("simplified");
    expect(accessibility?.["cognitiveLoadLimit"]).toBe("low");
  });
});

describe("ProfileService.applyProfilePatch", () => {
  it("applies a valid patch and updates the profile version", async () => {
    const service = new ProfileService();
    const quiz    = buildQuiz();
    const profile = await service.buildInitialProfile(quiz);

    const patch = new ProfilePatch({
      id: crypto.randomUUID(), sessionId: "s-001",
      studentId: quiz.student_id,
      baseProfileVersion: 1, newProfileVersion: 2,
      sessionSummary: "test patch", operations: [],
      generatorType: "test", generatorSchemaName: "1.0.0",
    });

    await service.applyProfilePatch(quiz.student_id, patch);
    expect(profile.profileVersion).toBe(2);
  });

  it("throws when the student has no profile", async () => {
    const service = new ProfileService();
    const patch = new ProfilePatch({
      id: crypto.randomUUID(), sessionId: "s-001", studentId: "ghost-student",
      baseProfileVersion: 1, newProfileVersion: 2,
      sessionSummary: "test", operations: [], generatorType: "test", generatorSchemaName: "1.0.0",
    });
    await expect(service.applyProfilePatch("ghost-student", patch)).rejects.toThrow();
  });

  it("throws when the patch conflicts with the current profile version", async () => {
    const service = new ProfileService();
    const quiz    = buildQuiz();
    await service.buildInitialProfile(quiz); // profileVersion = 1

    const staleBasePatch = new ProfilePatch({
      id: crypto.randomUUID(), sessionId: "s-001",
      studentId: quiz.student_id,
      baseProfileVersion: 0, // wrong — store is at version 1
      newProfileVersion: 1,
      sessionSummary: "stale patch", operations: [], generatorType: "test", generatorSchemaName: "1.0.0",
    });

    await expect(service.applyProfilePatch(quiz.student_id, staleBasePatch)).rejects.toThrow();
  });
});
