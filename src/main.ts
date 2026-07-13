import Anthropic from "@anthropic-ai/sdk";
import * as rl from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "dotenv";

import { IntakeQuiz } from "@domain/intake/IntakeQuiz.ts";
import { ProfileService } from "@services/ProfileService.ts";
import { SessionService } from "@services/SessionService.ts";
import { PromptProjectionService } from "@services/PromptProjectionService.ts";
import { FinalizerService } from "@services/FinalizerService.ts";
import type { LearningProfileStore } from "@domain/profile/LearningProfileStore.ts";
import type { Session } from "@domain/session/Session.ts";
import {
  computeBktUpdate,
  computeMasteryThreshold,
  BKT_PARAMS,
} from "@algorithms/BKT/BayesianKnowledgeTracing.ts";
import type { BktSkillState, KcTier } from "@algorithms/BKT/BayesianKnowledgeTracing.ts";
import {
  selectSocraticTier,
  computeScaffoldingAndTone,
  MAX_ATTEMPTS_BEFORE_FRUSTRATION,
} from "@algorithms/DSR/DynamicScaffolding.ts";

// Load .env from the working directory (works for both tsx dev-run and the bundled executable)
config();

// ── tutor problem definitions ─────────────────────────────────────────────────

interface TutorProblem {
  text:          string;
  skillId:       string;
  kcTier:        KcTier;
  /** Optional teacher-provided expected answer — when set the model is told not to contradict it. */
  expectedAnswer?: string;
}

const TUTOR_PROBLEMS: TutorProblem[] = [
  {
    text:           "Solve for x:  2x + 3 = 7",
    skillId:        "linear-equations",
    kcTier:         "identification",
    expectedAnswer: "x = 2",
  },
  {
    text:    "What is the slope of the line y = 3x - 2?",
    skillId: "slope-intercept",
    kcTier:  "interpretation",
    expectedAnswer: "3",
  },
  {
    text:           "Solve for x:  4x - 8 = 0",
    skillId:        "linear-equations",
    kcTier:         "identification",
    expectedAnswer: "x = 2",
  },
];

/** Keywords in the assistant reply that confirm a correct answer. */
const CORRECT_CONFIRMATION_SIGNALS = [
  "correct",
  "right",
  "exactly",
  "well done",
  "great job",
  "that's it",
  "yes",
  "perfect",
];

/** Number of consecutive at-mastery turns before printing a mastery achievement banner. */
const MASTERY_ANNOUNCEMENT_CONSECUTIVE = 2;

/** Hard ceiling on attempts for a single problem step. Guarantees the inner REPL loop always
 *  terminates even when the reveal-after-N-attempts policy is off and correctness detection
 *  never matches (DSR audit: the loop previously had no upper bound at all). */
const HARD_ATTEMPT_CEILING = 6;

/** Normalize a free-text answer for comparison: lowercase, strip whitespace, and drop a
 *  leading "x=" / "y=" style variable-assignment prefix so "x = 2", "x=2", and "2" all match. */
function normalizeAnswer(rawAnswer: string): string {
  return rawAnswer.toLowerCase().replace(/\s+/g, "").replace(/^[a-z]+=/, "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function finalizeAndUpdate(
  session:    Session,
  sessionSvc: SessionService,
  finalSvc:   FinalizerService,
  profileSvc: ProfileService,
  profile:    LearningProfileStore,
): Promise<void> {
  const endedSession = await sessionSvc.endSession(session.sessionId);
  const sessionEvents = await sessionSvc.getSessionEvents(endedSession.sessionId);
  const patch = await finalSvc.finalizeSessionToPatch(endedSession, sessionEvents, profile);
  const result = await finalSvc.applyPatchCompareAndSwap(profile, patch);
  if (result.applied) {
    console.log(`\nProfile updated to version ${result.newProfileVersion}.`);
  }
}

function printMasterySummary(profile: LearningProfileStore): void {
  console.log("\n--- Session Mastery Summary ---");
  for (const [skillId, skill] of Object.entries(profile.cognitive.skills)) {
    const percentage = (skill.masteryProbability * 100).toFixed(1);
    const filledBars = Math.round(skill.masteryProbability * 20);
    const bar        = "█".repeat(filledBars).padEnd(20, "░");
    console.log(`  ${skillId.padEnd(22)} ${bar}  ${percentage}%`);
  }
  console.log("-------------------------------\n");
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || apiKey === "your_key_here") {
    console.error(
      "ERROR: ANTHROPIC_API_KEY is not set.\n" +
      "Add your key to the .env file at the project root:\n  ANTHROPIC_API_KEY=sk-ant-...",
    );
    process.exit(1);
  }

  const anthropic    = new Anthropic({ apiKey });
  const profileSvc   = new ProfileService();
  const sessionSvc   = new SessionService();
  const projSvc      = new PromptProjectionService();
  const finalSvc     = new FinalizerService();
  const readline     = rl.createInterface({ input, output });

  console.log("\n=== VirtualTutor — Terminal v1 ===");
  console.log('\nType your answer and press Enter. Type "quit" to end the session.\n');

  // Seed an intake quiz and build the initial profile
  const intakeQuiz = new IntakeQuiz({
    id:           crypto.randomUUID(),
    student_id:   "demo-student-001",
    raw_responses: { gradeLevel: 9, locale: "en-US" },
    rag_output:   "",
  });

  const profile = await profileSvc.buildInitialProfile(intakeQuiz);
  const session = await sessionSvc.startSession(profile.student_id, profile.profileVersion);

  let problemIndex      = 0;
  let attemptsThisStep  = 0;
  let currentTier: 0 | 1 | 2 | 3 = 0;
  let consecutiveCorrect = 0;
  const recentExchangeLines: string[] = [];

  // ── REPL ─────────────────────────────────────────────────────────────────

  while (problemIndex < TUTOR_PROBLEMS.length) {
    const currentProblem = TUTOR_PROBLEMS[problemIndex];
    if (currentProblem === undefined) break;

    console.log(`\n[Problem ${problemIndex + 1} / ${TUTOR_PROBLEMS.length}]  ${currentProblem.text}`);

    let problemSolved = false;

    while (!problemSolved) {
      const rawInput = await readline.question("  Your answer: ");
      const studentInput = rawInput.trim();

      if (studentInput.toLowerCase() === "quit" || studentInput.toLowerCase() === "exit") {
        await finalizeAndUpdate(session, sessionSvc, finalSvc, profileSvc, profile);
        printMasterySummary(profile);
        readline.close();
        return;
      }

      attemptsThisStep++;

      // Log the student's turn
      await sessionSvc.appendEvent(session.sessionId, {
        role: "student", eventType: "message", content: studentInput,
      });

      // Correctness is checked against the teacher-provided expected answer (when set) using the
      // student's own input. Checking the tutor's reply text instead is a false-positive/
      // false-negative trap that can bypass a wrong answer or stall the loop forever on a
      // correct one (DSR audit finding).
      const hasExpectedAnswer = currentProblem.expectedAnswer !== undefined;
      let turnWasCorrect = hasExpectedAnswer
        ? normalizeAnswer(studentInput) === normalizeAnswer(currentProblem.expectedAnswer as string)
        : false;

      // Retrieve current BKT state for this problem's skill
      const skillState = profile.getSkillState(currentProblem.skillId);
      if (!skillState) throw new Error(`Skill ${currentProblem.skillId} missing from profile`);

      const currentBktState: BktSkillState = {
        masteryProbability: skillState.masteryProbability,
        slipRate:           skillState.slipRate,
        guessRate:          skillState.guessRate,
        successes:          0,
        failures:           0,
      };

      // DSR: determine hint tier
      const tierResult = selectSocraticTier(
        { tier: currentTier, attemptsThisStep, stuck: attemptsThisStep > MAX_ATTEMPTS_BEFORE_FRUSTRATION },
        {
          masteryProbability: skillState.masteryProbability,
          frustrationIndex:   profile.behavioral.frustrationIndex,
          errorType:          "procedural",
        },
      );
      currentTier = tierResult.tier;

      // DSR: derive scaffolding and tone controls
      const tutoringControls = computeScaffoldingAndTone(
        skillState.masteryProbability,
        profile.behavioral.frustrationIndex,
        profile.cognitive.metacognition.helpSeeking,
      );

      // Adjust frustration heuristically — more failed attempts → more frustration
      if (attemptsThisStep > MAX_ATTEMPTS_BEFORE_FRUSTRATION) {
        profile.adjustFrustration(0.05);
      }

      // Build prompt envelope with the updated profile view
      const profileView      = projSvc.derivePromptView(profile);
      const sanitizedView    = projSvc.sanitizeFreeTextFields(profileView);
      const recentExchange   = recentExchangeLines.slice(-6).join("\n");

      const tierInstruction =
        tierResult.tier === 1 ? "Use only a guiding question (Tier 1 — Socratic)." :
        tierResult.tier === 2 ? "Give a partial worked example then ask a follow-up question (Tier 2)." :
                                "Walk through the full solution with the student step by step (Tier 3 — direct).";

      const envelope = projSvc.buildPromptEnvelope(sanitizedView, {
        currentProblem:  currentProblem.text,
        sessionExchange: recentExchange,
        ...(currentProblem.expectedAnswer !== undefined && {
          expectedAnswer: currentProblem.expectedAnswer,
        }),
        studentPreviouslyCorrect: turnWasCorrect,
      });

      const systemWithTierPolicy = envelope.systemPrompt + `\n\nHINT POLICY FOR THIS TURN: ${tierInstruction}`;

      // Call Claude (streaming)
      process.stdout.write("\n  Tutor: ");
      let assistantReply = "";

      try {
        const stream = anthropic.messages.stream({
          model:      "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system:     systemWithTierPolicy,
          messages: [
            {
              role:    "user",
              content: `${envelope.userPrompt}\n\nStudent's latest answer: ${studentInput}`,
            },
          ],
        });

        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            process.stdout.write(chunk.delta.text);
            assistantReply += chunk.delta.text;
          }
        }
        console.log("\n");
      } catch (apiError) {
        console.error("\n  [API ERROR]", apiError);
        assistantReply = "I encountered an issue. Please try again.";
      }

      // Validate the response and log the assistant turn
      const validation = projSvc.validateModelResponse(assistantReply, {
        studentPreviouslyCorrect: turnWasCorrect,
      });

      await sessionSvc.appendEvent(session.sessionId, {
        role: "assistant", eventType: "message", content: assistantReply,
      });

      recentExchangeLines.push(`Student: ${studentInput}`);
      recentExchangeLines.push(`Tutor: ${assistantReply}`);

      // Fallback for problems without a teacher-provided expected answer: no ground truth
      // exists before the model replies, so detect confirmation from the tutor's reply text.
      if (!hasExpectedAnswer) {
        turnWasCorrect = CORRECT_CONFIRMATION_SIGNALS.some(signal =>
          assistantReply.toLowerCase().includes(signal),
        );
      }

      // BKT update
      const updatedBktState = computeBktUpdate(
        currentBktState,
        {
          correct:    turnWasCorrect,
          hintTier:   currentTier,
          affect:     profile.behavioral.frustrationIndex > 0.5 ? "frustrated" : "engaged",
        },
        BKT_PARAMS[currentProblem.kcTier],
      );
      profile.updateSkillMastery(currentProblem.skillId, updatedBktState.masteryProbability);

      if (turnWasCorrect) {
        // Reward: reduce frustration, reset counter, check mastery gate
        profile.adjustFrustration(-0.10);
        consecutiveCorrect++;

        const masteryCheck = computeMasteryThreshold(
          updatedBktState,
          currentProblem.kcTier,
          {
            consecutiveAtMastery:   consecutiveCorrect,
            sessionsAboveThreshold: 1,
            tier3Supported:         currentTier === 3,
          },
        );

        if (masteryCheck.mastered && consecutiveCorrect >= MASTERY_ANNOUNCEMENT_CONSECUTIVE) {
          console.log(
            `  [MASTERY] "${currentProblem.skillId}" ` +
            `(P(L) = ${updatedBktState.masteryProbability.toFixed(3)})`,
          );
        }

        // Advance to next problem
        problemSolved    = true;
        attemptsThisStep = 0;
        currentTier      = 0;
        recentExchangeLines.length = 0;
        problemIndex++;
        profile.resetAttemptCounter();
      } else {
        consecutiveCorrect = 0;
        const answerShouldBeRevealed = profile.recordFailedAttempt();

        // Force the step forward once the reveal policy fires or the hard ceiling is hit —
        // guarantees the inner loop always terminates regardless of policy configuration or
        // correctness-detection outcome (DSR audit: previously unbounded).
        if (answerShouldBeRevealed || attemptsThisStep >= HARD_ATTEMPT_CEILING) {
          if (currentProblem.expectedAnswer !== undefined) {
            console.log(`  [REVEAL] The expected answer was: ${currentProblem.expectedAnswer}`);
          }
          problemSolved    = true;
          attemptsThisStep = 0;
          currentTier      = 0;
          recentExchangeLines.length = 0;
          problemIndex++;
          profile.resetAttemptCounter();
        }
      }
    }
  }

  console.log("\nAll problems completed.");
  await finalizeAndUpdate(session, sessionSvc, finalSvc, profileSvc, profile);
  printMasterySummary(profile);
  readline.close();
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
