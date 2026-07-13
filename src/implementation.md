You are implementing the VirtualTutor backend. The scaffold already exists. Your job is to fill in
   every // TODO body and create one new file (src/main.ts). Do not refactor, rename, or restructure                                                                                                                                         ↑
   anything that is not listed below. Follow the exact math and mapping rules given.
                                                                                                                                                                                                                                             ↑
   0. Setup — run first
                                                                                                                                                                                                                                             ↑
   npm install @anthropic-ai/sdk
                                                                                                                                                                                                                                             ↑
   Add to /home/bryson-bodner/CodeProjects/VirtualTutor/.env:
   ANTHROPIC_API_KEY=your_key_here                                                                                                                                                                                                           ↑
   (Leave the placeholder — the user will fill it in.)
                                                                                                                                                                                                                                             ↑

   1. src/algorithms/BKT/BayesianKnowledgeTracing.ts
                                                                                                                                                                                                                                             ↑
   Replace both // TODO bodies. All constants (BKT_PARAMS, TIER3_INFLATED, CLAMP_MIN/MAX,
   thresholds) are already declared above the functions — use them.                                                                                                                                                                          ↑

   computeBktUpdate                                                                                                                                                                                                                          ↑

   // effective params — use TIER3_INFLATED overrides when hintTier === 3                                                                                                                                                                    ↑
   let G = params.G;
   let S = params.S;                                                                                                                                                                                                                         ↑
   if (observation.hintTier === 3) { G = TIER3_INFLATED.G; S = TIER3_INFLATED.S; }
   // affect adjustment (studentmodeling-006): frustration inflates slip, boredom inflates guess                                                                                                                                             ↑
   if (observation.affect === "frustrated") { S = Math.min(S *1.2, 0.5); }
   if (observation.affect === "bored")      { G = Math.min(G* 1.2, 0.5); }                                                                                                                                                                  ↑

   const P = prior.masteryProbability;                                                                                                                                                                                                       ↑
   const T = params.T;
                                                                                                                                                                                                                                             ↑
   // Bayesian update
   const posterior = observation.correct                                                                                                                                                                                                     ↑
     ? (P *(1 - S)) / (P* (1 - S) + (1 - P) *G)
     : (P* S)       / (P *S       + (1 - P)* (1 - G));                                                                                                                                                                                    ↑

   // Learning transition                                                                                                                                                                                                                    ↑
   const updated = posterior + (1 - posterior) * T;
                                                                                                                                                                                                                                             ↑
   return {
     masteryProbability: Math.max(CLAMP_MIN, Math.min(updated, CLAMP_MAX)),                                                                                                                                                                  ↑
     slipRate: S,
     guessRate: G,                                                                                                                                                                                                                           ↑
     successes: prior.successes + (observation.correct ? 1 : 0),
     failures:  prior.failures  + (observation.correct ? 0 : 1),                                                                                                                                                                             ↑
   };
                                                                                                                                                                                                                                             ↑
   computeMasteryThreshold
                                                                                                                                                                                                                                             ↑
   const isFoundational = kcTier === "identification" || kcTier === "interpretation";
   const thresholdUsed  = isFoundational ? THRESHOLD_FOUNDATIONAL : THRESHOLD_DEPENDENT;                                                                                                                                                     ↑
   const mastered       = skill.masteryProbability >= thresholdUsed;
                                                                                                                                                                                                                                             ↑
   // Tier-3-supported mastery requires one extra consecutive opportunity
   const requiredConsecutive = history.tier3Supported                                                                                                                                                                                        ↑
     ? CONSECUTIVE_OPPORTUNITIES + 1
     : CONSECUTIVE_OPPORTUNITIES;                                                                                                                                                                                                            ↑

   const gateOpen = mastered                                                                                                                                                                                                                 ↑
     && history.consecutiveAtMastery  >= requiredConsecutive
     && history.sessionsAboveThreshold >= STABILITY_SESSIONS;                                                                                                                                                                                ↑

   return { mastered, gateOpen, thresholdUsed };                                                                                                                                                                                             ↑

   1. src/algorithms/FSRS/FreeSpacedRepetition.ts                                                                                                                                                                                            ↑

   Replace all three // TODO bodies. All constants are already declared.                                                                                                                                                                     ↑

   computeRetrievability                                                                                                                                                                                                                     ↑

   const MS_PER_DAY = 86_400_000;                                                                                                                                                                                                            ↑
   const daysSince = (now.getTime() - state.lastReviewDate.getTime()) / MS_PER_DAY;
   if (daysSince <= FORGETTING_GRACE_DAYS) return 1.0;                                                                                                                                                                                       ↑
   const F = FORGETTING_RATE[state.kcTier];
   return Math.max(0, Math.min(1, state.masteryProbability *Math.exp(-F* daysSince)));                                                                                                                                                     ↑

   computeFsrsState                                                                                                                                                                                                                          ↑

   let { stability, difficulty, masteryProbability } = state;                                                                                                                                                                                ↑
   if (review.correct) {
     stability    = stability *(1 + 0.2 / Math.max(0.1, difficulty));                                                                                                                                                                       ↑
     difficulty   = Math.max(0.1, difficulty - 0.05);
     masteryProbability = Math.min(0.9999, masteryProbability + 0.05);                                                                                                                                                                       ↑
   } else {
     stability    = stability* 0.5;                                                                                                                                                                                                         ↑
     difficulty   = Math.min(1.0, difficulty + 0.1);
     masteryProbability = Math.max(0.0001, masteryProbability - 0.10);                                                                                                                                                                       ↑
   }
   return {                                                                                                                                                                                                                                  ↑
     stability:         Math.max(0.1, stability),
     difficulty:        difficulty,                                                                                                                                                                                                          ↑
     lastReviewDate:    review.reviewedAt,
     masteryProbability,                                                                                                                                                                                                                     ↑
     kcTier:            state.kcTier,
   };                                                                                                                                                                                                                                        ↑

   isDueForReview                                                                                                                                                                                                                            ↑

   return computeRetrievability(state, now) < DUE_THRESHOLD;                                                                                                                                                                                 ↑

   1. src/algorithms/DSR/DynamicScaffolding.ts                                                                                                                                                                                               ↑

   Replace all three // TODO bodies. All constants are already declared.                                                                                                                                                                     ↑

   selectSocraticTier                                                                                                                                                                                                                        ↑

   // Treat tier 0 (first turn) as tier 1                                                                                                                                                                                                    ↑
   const prevTier = current.tier === 0 ? 1 : current.tier;
                                                                                                                                                                                                                                             ↑
   // High frustration — escalate immediately
   if (signals.frustrationIndex >= FRUSTRATION_HIGH) {                                                                                                                                                                                       ↑
     const tier = Math.min(3, prevTier + 1) as 1 | 2 | 3;
     return { tier, deliverHint: true,                                                                                                                                                                                                       ↑
       masteryDeltaCap: tier === 3 ? TIER3_DELTA_MAX : STANDARD_DELTA_MAX };
   }                                                                                                                                                                                                                                         ↑

   // Stuck AND past the productive-struggle window — escalate                                                                                                                                                                               ↑
   if (current.stuck && current.attemptsThisStep > MIN_ATTEMPTS_BEFORE_HINT) {
     const tier = Math.min(3, prevTier + 1) as 1 | 2 | 3;                                                                                                                                                                                    ↑
     return { tier, deliverHint: tier > 1,
       masteryDeltaCap: tier === 3 ? TIER3_DELTA_MAX : STANDARD_DELTA_MAX };                                                                                                                                                                 ↑
   }
                                                                                                                                                                                                                                             ↑
   // Too many failed attempts without marking stuck — still escalate
   if (current.attemptsThisStep > MAX_ATTEMPTS_BEFORE_FRUSTRATION) {                                                                                                                                                                         ↑
     const tier = Math.min(3, prevTier + 1) as 1 | 2 | 3;
     return { tier, deliverHint: true,                                                                                                                                                                                                       ↑
       masteryDeltaCap: tier === 3 ? TIER3_DELTA_MAX : STANDARD_DELTA_MAX };
   }                                                                                                                                                                                                                                         ↑

   // Default: Tier 1, no hint yet (desirable-difficulties window)                                                                                                                                                                           ↑
   return { tier: 1, deliverHint: false, masteryDeltaCap: STANDARD_DELTA_MAX };
                                                                                                                                                                                                                                             ↑
   computeScaffoldingAndTone
                                                                                                                                                                                                                                             ↑
   let scaffoldingLevel: "none" | "faded" | "high";
   let socraticRatio: number;                                                                                                                                                                                                                ↑

   if (frustrationIndex >= FRUSTRATION_HIGH) {                                                                                                                                                                                               ↑
     scaffoldingLevel = "high";
     socraticRatio    = 0.0;                                                                                                                                                                                                                 ↑
   } else if (mastery < 0.40) {
     scaffoldingLevel = "faded";                                                                                                                                                                                                             ↑
     socraticRatio    = 0.3;
   } else {                                                                                                                                                                                                                                  ↑
     scaffoldingLevel = "none";
     socraticRatio    = 1.0;                                                                                                                                                                                                                 ↑
   }
                                                                                                                                                                                                                                             ↑
   // Avoidant students need immediate feedback; others can tolerate delayed
   const feedbackTiming: "immediate" | "delayed" =                                                                                                                                                                                           ↑
     helpSeeking === "avoidant" ? "immediate" : "delayed";
                                                                                                                                                                                                                                             ↑
   // Tone
   let toneOverride: "encouraging" | "direct" | "analytical" | undefined;                                                                                                                                                                    ↑
   if (frustrationIndex >= FRUSTRATION_HIGH) {
     toneOverride = "encouraging";                                                                                                                                                                                                           ↑
   } else if (helpSeeking === "avoidant") {
     toneOverride = "direct";                                                                                                                                                                                                                ↑
   } else if (mastery > 0.70) {
     toneOverride = "analytical";                                                                                                                                                                                                            ↑
   }
                                                                                                                                                                                                                                             ↑
   return { scaffoldingLevel, socraticRatio, feedbackTiming, ...(toneOverride !== undefined && { toneOverride }) };
                                                                                                                                                                                                                                             ↑
   detectStuckLoop
                                                                                                                                                                                                                                             ↑
   if (recentSessions.length < CONSECUTIVE_SESSION_FLAG) {
     return { loopType: "productive", sessionFlag: false };                                                                                                                                                                                  ↑
   }
   const last3 = recentSessions.slice(-CONSECUTIVE_SESSION_FLAG);                                                                                                                                                                            ↑
   const allStuck    = last3.every(s => s.loopType === "stuck");
   const allAvoidant = last3.every(s => s.loopType === "avoidant");                                                                                                                                                                          ↑
   if (allStuck)    return { loopType: "stuck",    sessionFlag: true };
   if (allAvoidant) return { loopType: "avoidant", sessionFlag: true };                                                                                                                                                                      ↑

   const stuckCount    = last3.filter(s => s.loopType === "stuck").length;                                                                                                                                                                   ↑
   const avoidantCount = last3.filter(s => s.loopType === "avoidant").length;
   if (stuckCount    > avoidantCount) return { loopType: "stuck",    sessionFlag: false };                                                                                                                                                   ↑
   if (avoidantCount > stuckCount)    return { loopType: "avoidant", sessionFlag: false };
   return { loopType: "productive", sessionFlag: false };                                                                                                                                                                                    ↑

   1. src/domain/profile/LearningProfileStore.ts                                                                                                                                                                                             ↑

   Replace both // TODO bodies inside the LearningProfileStore class.                                                                                                                                                                        ↑

   applyPatch                                                                                                                                                                                                                                ↑

   The caller (FinalizerService.applyPatchCompareAndSwap) already checks hasConflict before                                                                                                                                                  ↑
   calling this — just apply and bump the version.
                                                                                                                                                                                                                                             ↑
   for (const op of patch.operations) {
     if (op.op === "update_mastery" && op.skillId !== undefined && op.masteryDelta !== undefined) {                                                                                                                                          ↑
       const skill = this._cognitive.skills[op.skillId];
       if (skill !== undefined) {                                                                                                                                                                                                            ↑
         skill.masteryProbability = Math.max(0.0001,
           Math.min(0.9999, skill.masteryProbability + op.masteryDelta));                                                                                                                                                                    ↑
       }
     } else if (op.op === "update_behavioral" && op.path !== undefined && op.value !== undefined) {                                                                                                                                          ↑
       // Simple dot-path write into_behavioral
       const parts = op.path.split(".");                                                                                                                                                                                                     ↑
       let obj: Record<string, unknown> = this._behavioral as unknown as Record<string, unknown>;
       for (let i = 0; i < parts.length - 1; i++) {                                                                                                                                                                                          ↑
         const segment = parts[i];
         if (segment !== undefined) obj = obj[segment] as Record<string, unknown>;                                                                                                                                                           ↑
       }
       const last = parts[parts.length - 1];                                                                                                                                                                                                 ↑
       if (last !== undefined) obj[last] = op.value;
     }                                                                                                                                                                                                                                       ↑
   }
   this._profileVersion = patch.newProfileVersion;                                                                                                                                                                                           ↑
   this.markDelta();
                                                                                                                                                                                                                                             ↑
   checkPrerequisiteGate
                                                                                                                                                                                                                                             ↑
   // flags.MD flag 1: 0.75 mastery required before unlocking dependent skill
   const skill = this._cognitive.skills[skillId];                                                                                                                                                                                            ↑
   if (skill === undefined) return false;
   return skill.masteryProbability >= 0.75;                                                                                                                                                                                                  ↑

   1. src/services/PromptProjectionService.ts                                                                                                                                                                                                ↑

   Add import { createHash } from "node:crypto"; at the top.                                                                                                                                                                                 ↑
   Replace all four // TODO bodies.
                                                                                                                                                                                                                                             ↑
   derivePromptView
                                                                                                                                                                                                                                             ↑
   import type { LearningProfileStore } from "@domain/profile/LearningProfileStore.ts";
   import type { LearningProfilePayload } from "@domain/profile/LearningProfilePromptView.ts";                                                                                                                                               ↑
   import { createHash } from "node:crypto";
   // ... (class body, add crypto import at file top)                                                                                                                                                                                        ↑

   Body:                                                                                                                                                                                                                                     ↑
   const studentIdHash = createHash("sha256").update(store.student_id).digest("hex");
                                                                                                                                                                                                                                             ↑
   // Map skills — drop evidenceLog, dataRetentionTtl, raw gradeLevel
   const skills: LearningProfilePayload["cognitive"]["skills"] = {};                                                                                                                                                                         ↑
   for (const [skillId, skill] of Object.entries(store.cognitive.skills)) {
     skills[skillId] = {                                                                                                                                                                                                                     ↑
       skillName: skillId,
       masteryProbability: skill.masteryProbability,                                                                                                                                                                                         ↑
       slipRate: skill.slipRate,
       guessRate: skill.guessRate,                                                                                                                                                                                                           ↑
       retrievabilityScore: skill.masteryProbability, // FSRS not separately tracked in store; use mastery as proxy
       dueForReview: skill.dueForReview,                                                                                                                                                                                                     ↑
     };
   }                                                                                                                                                                                                                                         ↑

   // Gate misconceptions below 0.60 confidence                                                                                                                                                                                              ↑
   const activeMisconceptions = store.cognitive.misconceptions
     .filter(m => m.confidenceScore >= 0.60)                                                                                                                                                                                                 ↑
     .map(m => ({ misconceptionId: m.id, description: m.id, confidence: m.confidenceScore }));
                                                                                                                                                                                                                                             ↑
   const bLevel = store.behavioral.scaffoldingLevel.toLowerCase() as "none" | "faded" | "high";
   const arPolicy = store.behavioral.answerRevealPolicy.toLowerCase()                                                                                                                                                                        ↑
     .replace("*", "*") as "never" | "after_3_attempts" | "on_request";
                                                                                                                                                                                                                                             ↑
   const payload: LearningProfilePayload = {
     schemaVersion: "1.3.0",                                                                                                                                                                                                                 ↑
     learnerIdentity: {
       studentIdHash,                                                                                                                                                                                                                        ↑
       gradeLevel: 9,
       locale: "en-US",                                                                                                                                                                                                                      ↑
     },
     cognitive: { skills, activeMisconceptions },                                                                                                                                                                                            ↑
     behavioral: {
       accessibility: {                                                                                                                                                                                                                      ↑
         readingLevelAdjustment: "standard",
         cognitiveLoadLimit: "standard",                                                                                                                                                                                                     ↑
         modalityPreference: "text_heavy",
       },                                                                                                                                                                                                                                    ↑
       transientState: {
         frustrationIndex: store.behavioral.frustrationIndex,                                                                                                                                                                                ↑
         helpSeekingBehavior: store.cognitive.metacognition.helpSeeking,
         persistence: store.cognitive.metacognition.persistence,                                                                                                                                                                             ↑
         selfReportConfidenceCalibration:
           store.cognitive.metacognition.selfReportConfidenceCalibration,                                                                                                                                                                    ↑
       },
       tutoringControls: {                                                                                                                                                                                                                   ↑
         scaffoldingLevel: bLevel,
         feedbackTiming: "immediate",                                                                                                                                                                                                        ↑
         socraticRatio: store.behavioral.socraticRatio,
         answerRevealPolicy: arPolicy,                                                                                                                                                                                                       ↑
       },
       privacyConstraints: {                                                                                                                                                                                                                 ↑
         blockFreeTextInjection: true,
         allowedPersonalizationCategories: [],                                                                                                                                                                                               ↑
       },
     },                                                                                                                                                                                                                                      ↑
     historical: {
       learningGoals: {                                                                                                                                                                                                                      ↑
         longTermGoals: store.historical.pastGoals.map((g, i) => ({
           goalId: `goal-${i}`,                                                                                                                                                                                                              ↑
           description: g,
           source: "student" as const,                                                                                                                                                                                                       ↑
         })),
         currentSessionFocus: [],                                                                                                                                                                                                            ↑
       },
       streakRetentionDays: 0,                                                                                                                                                                                                               ↑
       totalQuestionsAnswered: store.historical.totalQuestionsAnswered,
     },                                                                                                                                                                                                                                      ↑
   };
   if (store.tone_notes) payload.toneOverride = store.tone_notes;                                                                                                                                                                            ↑
   return payload;
                                                                                                                                                                                                                                             ↑
   sanitizeFreeTextFields
                                                                                                                                                                                                                                             ↑
   if (!payload.behavioral.privacyConstraints.blockFreeTextInjection) return payload;
   const safe = { ...payload };                                                                                                                                                                                                              ↑
   const safeTones = ["encouraging", "direct", "analytical"] as const;
   if (safe.toneOverride !== undefined && !safeTones.includes(safe.toneOverride as typeof safeTones[number])) {                                                                                                                              ↑
     const copy = { ...safe };
     delete copy.toneOverride;                                                                                                                                                                                                               ↑
     return copy;
   }                                                                                                                                                                                                                                         ↑
   return safe;
                                                                                                                                                                                                                                             ↑
   buildPromptEnvelope
                                                                                                                                                                                                                                             ↑
   const policyVersion = "1.0.0";
   const profileJson = JSON.stringify(payload, null, 2);                                                                                                                                                                                     ↑

   const scaffolding = payload.behavioral.tutoringControls.scaffoldingLevel;                                                                                                                                                                 ↑
   const socratic    = payload.behavioral.tutoringControls.socraticRatio;
                                                                                                                                                                                                                                             ↑
   const systemPrompt =
   `You are an expert math tutor. Your responses are strictly governed by the student profile below.                                                                                                                                         ↑
   Rules:

- Scaffolding level "${scaffolding}": ${scaffolding === "high" ? "give step-by-step guidance" : scaffolding === "faded" ? "give partial guidance then let student complete" : "ask guiding questions only"}.                              ↑
- Socratic ratio ${socratic.toFixed(1)}: ${socratic >= 0.7 ? "prefer questions over direct answers" : socratic <= 0.2 ? "use direct instruction" : "mix questions and direct guidance"}.
- Never reveal the final answer unless explicitly allowed by answerRevealPolicy.                                                                                                                                                          ↑
- Keep responses concise and focused on the current problem.
- Do NOT repeat or expose the student profile JSON.                                                                                                                                                                                       ↑

   STUDENT PROFILE:                                                                                                                                                                                                                          ↑
   ${profileJson}`;
                                                                                                                                                                                                                                             ↑
   const userPrompt =
   `CURRENT PROBLEM:                                                                                                                                                                                                                         ↑
   ${context.currentProblem}
                                                                                                                                                                                                                                             ↑
   SESSION EXCHANGE:
   ${context.sessionExchange}`;                                                                                                                                                                                                              ↑

   return { systemPrompt, userPrompt, policyVersion };                                                                                                                                                                                       ↑

   validateModelResponse                                                                                                                                                                                                                     ↑

   if (rawResponse === null || rawResponse === undefined || rawResponse === "") {                                                                                                                                                            ↑
     return { valid: false, errors: ["Empty response"] };
   }                                                                                                                                                                                                                                         ↑
   if (typeof rawResponse !== "string" && typeof rawResponse !== "object") {
     return { valid: false, errors: ["Response must be a string or object"] };                                                                                                                                                               ↑
   }
   return { valid: true, errors: [] };                                                                                                                                                                                                       ↑

   1. src/services/FinalizerService.ts                                                                                                                                                                                                       ↑

   Add these imports at the top:                                                                                                                                                                                                             ↑
   import { ProfilePatch } from "@domain/profile/ProfilePatch.ts";
   import type { PatchOperation } from "@domain/profile/ProfilePatch.ts";                                                                                                                                                                    ↑

   Remove the import type for ProfilePatch (it must be a value import now for new ProfilePatch).                                                                                                                                             ↑

   Replace both // TODO bodies.                                                                                                                                                                                                              ↑

   finalizeSessionToPatch                                                                                                                                                                                                                    ↑

   const messageEvents = events.filter(e => e.eventType === "message" && e.role === "student");                                                                                                                                              ↑
   const assistantEvents = events.filter(e => e.eventType === "message" && e.role === "assistant");
                                                                                                                                                                                                                                             ↑
   // Detect correct responses: assistant said "correct", "right", "exactly", or "well done"
   const correctKeywords = ["correct", "right", "exactly", "well done", "great", "yes"];                                                                                                                                                     ↑
   const correctCount = assistantEvents.filter(e =>
     correctKeywords.some(kw => e.content?.toLowerCase().includes(kw))                                                                                                                                                                       ↑
   ).length;
   const totalExchanges = Math.max(1, assistantEvents.length);                                                                                                                                                                               ↑
   const successRatio = correctCount / totalExchanges;
                                                                                                                                                                                                                                             ↑
   const operations: PatchOperation[] = [];
                                                                                                                                                                                                                                             ↑
   for (const [skillId, skill] of Object.entries(baseProfile.cognitive.skills)) {
     // Mastery delta proportional to success ratio, capped at ±0.10                                                                                                                                                                         ↑
     const masteryDelta = (successRatio - 0.5) * 0.20;
     if (Math.abs(masteryDelta) > 0.005) {                                                                                                                                                                                                   ↑
       operations.push({
         op: "update_mastery",                                                                                                                                                                                                               ↑
         skillId,
         masteryDelta,                                                                                                                                                                                                                       ↑
         confidence: 0.70,
         reason: `Session success ratio: ${successRatio.toFixed(2)} (${correctCount}/${totalExchanges})`,                                                                                                                                    ↑
         evidenceRefs: messageEvents.slice(0, 5).map(e => e.id),
       });                                                                                                                                                                                                                                   ↑
     }
   }                                                                                                                                                                                                                                         ↑

   const summary =                                                                                                                                                                                                                           ↑
     `Session ${session.sessionId}: ${messageEvents.length} student turns,` +
     `${correctCount} confirmed correct (ratio ${successRatio.toFixed(2)}).`;                                                                                                                                                                ↑

   return new ProfilePatch({                                                                                                                                                                                                                 ↑
     id: crypto.randomUUID(),
     sessionId: session.sessionId,                                                                                                                                                                                                           ↑
     studentId: session.studentId,
     baseProfileVersion: baseProfile.profileVersion,                                                                                                                                                                                         ↑
     newProfileVersion: baseProfile.profileVersion + 1,
     sessionSummary: summary,                                                                                                                                                                                                                ↑
     operations,
     generatorType: "FinalizerService",                                                                                                                                                                                                      ↑
     generatorSchemaName: "1.0.0",
   });                                                                                                                                                                                                                                       ↑

   applyPatchCompareAndSwap                                                                                                                                                                                                                  ↑

   if (patch.hasConflict(store.profileVersion)) {                                                                                                                                                                                            ↑
     return { applied: false, newProfileVersion: store.profileVersion };
   }                                                                                                                                                                                                                                         ↑
   store.applyPatch(patch);
   return { applied: true, newProfileVersion: patch.newProfileVersion };                                                                                                                                                                     ↑

   1. src/services/ProfileService.ts                                                                                                                                                                                                         ↑

   Add these imports:                                                                                                                                                                                                                        ↑
   import { LearningProfileStore } from "@domain/profile/LearningProfileStore.ts";
   import type { SkillState, CognitiveState, BehavioralState, HistoricalState } from "@domain/profile/LearningProfileStore.ts";                                                                                                              ↑
   import { BKT_PARAMS } from "@algorithms/BKT/BayesianKnowledgeTracing.ts";
   import { FinalizerService } from "@services/FinalizerService.ts";                                                                                                                                                                         ↑

   Add a private in-memory store inside the class:                                                                                                                                                                                           ↑
   private readonly _store = new Map<string, LearningProfileStore>();
   private readonly_finalizer = new FinalizerService();                                                                                                                                                                                     ↑

   Replace all three // TODO bodies.                                                                                                                                                                                                         ↑

   getProfile                                                                                                                                                                                                                                ↑

   return this._store.get(studentId) ?? null;                                                                                                                                                                                                ↑

   buildInitialProfile                                                                                                                                                                                                                       ↑

   const skills: CognitiveState["skills"] = {                                                                                                                                                                                                ↑
     "linear-equations": {
       masteryProbability: BKT_PARAMS.identification.L0,                                                                                                                                                                                     ↑
       slipRate:           BKT_PARAMS.identification.S,
       guessRate:          BKT_PARAMS.identification.G,                                                                                                                                                                                      ↑
       difficulty: 0.5,
       stability:  1.0,                                                                                                                                                                                                                      ↑
       lastReviewDate: new Date(),
       dueForReview: false,                                                                                                                                                                                                                  ↑
       knowledgeComponents: {
         "KC-01": { kcId: "KC-01", kcName: "Variable Identification",                                                                                                                                                                        ↑
                    masteryScore: BKT_PARAMS.identification.L0, exposureCount: 0 },
         "KC-02": { kcId: "KC-02", kcName: "Equation Recognition",                                                                                                                                                                           ↑
                    masteryScore: BKT_PARAMS.identification.L0, exposureCount: 0 },
       },                                                                                                                                                                                                                                    ↑
     },
     "slope-intercept": {                                                                                                                                                                                                                    ↑
       masteryProbability: BKT_PARAMS.interpretation.L0,
       slipRate:           BKT_PARAMS.interpretation.S,                                                                                                                                                                                      ↑
       guessRate:          BKT_PARAMS.interpretation.G,
       difficulty: 0.6,                                                                                                                                                                                                                      ↑
       stability:  1.0,
       lastReviewDate: new Date(),                                                                                                                                                                                                           ↑
       dueForReview: false,
       knowledgeComponents: {                                                                                                                                                                                                                ↑
         "KC-03": { kcId: "KC-03", kcName: "Slope Interpretation",
                    masteryScore: BKT_PARAMS.interpretation.L0, exposureCount: 0 },                                                                                                                                                          ↑
         "KC-04": { kcId: "KC-04", kcName: "Y-Intercept Identification",
                    masteryScore: BKT_PARAMS.interpretation.L0, exposureCount: 0 },                                                                                                                                                          ↑
       },
     },                                                                                                                                                                                                                                      ↑
   };
                                                                                                                                                                                                                                             ↑
   const profile = new LearningProfileStore({
     id: crypto.randomUUID(),                                                                                                                                                                                                                ↑
     student_id: quiz.student_id,
     cognitive: {                                                                                                                                                                                                                            ↑
       skills,
       misconceptions: [],                                                                                                                                                                                                                   ↑
       metacognition: {
         selfReportConfidenceCalibration: 0.5,                                                                                                                                                                                               ↑
         helpSeeking: "optimal",
         persistence: 0.5,                                                                                                                                                                                                                   ↑
       },
     },                                                                                                                                                                                                                                      ↑
     behavioral: {
       frustrationIndex: 0.0,                                                                                                                                                                                                                ↑
       scaffoldingLevel: "NONE",
       socraticRatio: 1.0,                                                                                                                                                                                                                   ↑
       answerRevealPolicy: "AFTER_3_ATTEMPTS",
       failedAttemptsCounter: 0,                                                                                                                                                                                                             ↑
     },
     historical: {                                                                                                                                                                                                                           ↑
       pastGoals: [],
       totalQuestionsAnswered: 0,                                                                                                                                                                                                            ↑
       masteredSkillIds: [],
     },                                                                                                                                                                                                                                      ↑
     tone_notes: "",
     schemaVersion: "1.3.0",                                                                                                                                                                                                                 ↑
     profileVersion: 1,
     generatedFrom: { intakeQuizId: quiz.id },                                                                                                                                                                                               ↑
   });
                                                                                                                                                                                                                                             ↑
   this._store.set(quiz.student_id, profile);
   return profile;                                                                                                                                                                                                                           ↑

   applyProfilePatch                                                                                                                                                                                                                         ↑

   const profile = this._store.get(studentId);                                                                                                                                                                                               ↑
   if (!profile) throw new Error(`Profile not found for student ${studentId}`);
   const result = await this._finalizer.applyPatchCompareAndSwap(profile, patch);                                                                                                                                                            ↑
   if (!result.applied) throw new Error("Patch conflict — profile version mismatch");
                                                                                                                                                                                                                                             ↑
   8. src/services/SessionService.ts
                                                                                                                                                                                                                                             ↑
   Add these imports:
   import { Session } from "@domain/session/Session.ts";                                                                                                                                                                                     ↑
   import { SessionEvent } from "@domain/session/SessionEvent.ts";
                                                                                                                                                                                                                                             ↑
   Add in-memory state inside the class:
   private readonly _sessions  = new Map<string, Session>();                                                                                                                                                                                 ↑
   private readonly_events    = new Map<string, SessionEvent[]>();
   private readonly _seqCounts = new Map<string, number>();                                                                                                                                                                                  ↑

   Replace all four // TODO bodies.                                                                                                                                                                                                          ↑

   startSession                                                                                                                                                                                                                              ↑

   const session = new Session({                                                                                                                                                                                                             ↑
     sessionId: crypto.randomUUID(),
     studentId,                                                                                                                                                                                                                              ↑
     status: "active",
     profileVersionAtStart,                                                                                                                                                                                                                  ↑
   });
   this._sessions.set(session.sessionId, session);                                                                                                                                                                                           ↑
   this._events.set(session.sessionId, []);
   this._seqCounts.set(session.sessionId, 0);                                                                                                                                                                                                ↑
   return session;
                                                                                                                                                                                                                                             ↑
   appendEvent
                                                                                                                                                                                                                                             ↑
   const session = this._sessions.get(sessionId);
   if (!session) throw new Error(`Session ${sessionId} not found`);                                                                                                                                                                          ↑
   const seq = (this._seqCounts.get(sessionId) ?? 0) + 1;
   this._seqCounts.set(sessionId, seq);                                                                                                                                                                                                      ↑

   const evt = SessionEvent.createMessageEvent({                                                                                                                                                                                             ↑
     id: crypto.randomUUID(),
     sessionId,                                                                                                                                                                                                                              ↑
     studentId: session.studentId,
     seq,                                                                                                                                                                                                                                    ↑
     role: event.role,
     content: event.content ?? "",                                                                                                                                                                                                           ↑
     profileVersionAtTurn: session.profileVersionAtStart,
     promptPolicyVersion: "1.0.0",                                                                                                                                                                                                           ↑
   });
   this._events.get(sessionId)!.push(evt);                                                                                                                                                                                                   ↑
   return evt;
                                                                                                                                                                                                                                             ↑
   getSessionEvents
                                                                                                                                                                                                                                             ↑
   return this._events.get(sessionId) ?? [];
                                                                                                                                                                                                                                             ↑
   endSession
                                                                                                                                                                                                                                             ↑
   const session = this._sessions.get(sessionId);
   if (!session) throw new Error(`Session ${sessionId} not found`);                                                                                                                                                                          ↑
   session.markEnded();
   return session;                                                                                                                                                                                                                           ↑

   1. src/main.ts — terminal REPL (new file)                                                                                                                                                                                                 ↑

   Create this file at src/main.ts. It wires all services together for an interactive terminal                                                                                                                                               ↑
   session. No Postgres or Redis — everything is in-memory.
                                                                                                                                                                                                                                             ↑
   import Anthropic from "@anthropic-ai/sdk";
   import * as rl from "node:readline/promises";                                                                                                                                                                                             ↑
   import { stdin as input, stdout as output } from "node:process";
                                                                                                                                                                                                                                             ↑
   import { IntakeQuiz } from "@domain/intake/IntakeQuiz.ts";
   import { ProfileService } from "@services/ProfileService.ts";                                                                                                                                                                             ↑
   import { SessionService } from "@services/SessionService.ts";
   import { PromptProjectionService } from "@services/PromptProjectionService.ts";                                                                                                                                                           ↑
   import { FinalizerService } from "@services/FinalizerService.ts";
   import {                                                                                                                                                                                                                                  ↑
     computeBktUpdate,
     computeMasteryThreshold,                                                                                                                                                                                                                ↑
     BKT_PARAMS,
   } from "@algorithms/BKT/BayesianKnowledgeTracing.ts";                                                                                                                                                                                     ↑
   import type { BktSkillState, KcTier } from "@algorithms/BKT/BayesianKnowledgeTracing.ts";
   import {                                                                                                                                                                                                                                  ↑
     selectSocraticTier,
     computeScaffoldingAndTone,                                                                                                                                                                                                              ↑
   } from "@algorithms/DSR/DynamicScaffolding.ts";
                                                                                                                                                                                                                                             ↑
   // ── helpers ──────────────────────────────────────────────────────────────────
                                                                                                                                                                                                                                             ↑
   const STUDENT_ID = "demo-student-001";
                                                                                                                                                                                                                                             ↑
   const PROBLEMS = [
     { text: "Solve for x:  2x + 3 = 7",       skill: "linear-equations",  kcTier: "identification" as KcTier },                                                                                                                             ↑
     { text: "What is the slope of y = 3x - 2?", skill: "slope-intercept",  kcTier: "interpretation" as KcTier },
     { text: "Solve for x:  4x - 8 = 0",        skill: "linear-equations",  kcTier: "identification" as KcTier },                                                                                                                            ↑
   ];
                                                                                                                                                                                                                                             ↑
   // ── main ─────────────────────────────────────────────────────────────────────
                                                                                                                                                                                                                                             ↑
   async function main() {
     const apiKey = process.env["ANTHROPIC_API_KEY"];                                                                                                                                                                                        ↑
     if (!apiKey) {
       console.error("ERROR: ANTHROPIC_API_KEY not set in .env");                                                                                                                                                                            ↑
       process.exit(1);
     }                                                                                                                                                                                                                                       ↑

     const anthropic   = new Anthropic({ apiKey });                                                                                                                                                                                          ↑
     const profileSvc  = new ProfileService();
     const sessionSvc  = new SessionService();                                                                                                                                                                                               ↑
     const projSvc     = new PromptProjectionService();
     const finalSvc    = new FinalizerService();                                                                                                                                                                                             ↑
     const readline    = rl.createInterface({ input, output });
                                                                                                                                                                                                                                             ↑
     console.log("\n=== VirtualTutor Terminal ===");
     console.log("Type your answer and press Enter. Type 'quit' to end the session.\n");                                                                                                                                                     ↑

     // ── seed profile ─────────────────────────────────────────────────────────                                                                                                                                                            ↑
     const quiz = new IntakeQuiz({
       id: crypto.randomUUID(),                                                                                                                                                                                                              ↑
       student_id: STUDENT_ID,
       raw_responses: { gradeLevel: 9 },                                                                                                                                                                                                     ↑
       rag_output: "",
     });                                                                                                                                                                                                                                     ↑
     const profile   = await profileSvc.buildInitialProfile(quiz);
     const session   = await sessionSvc.startSession(STUDENT_ID, profile.profileVersion);                                                                                                                                                    ↑

     let problemIdx  = 0;                                                                                                                                                                                                                    ↑
     let attemptsThisStep = 0;
     let currentTier: 0 | 1 | 2 | 3 = 0;                                                                                                                                                                                                     ↑
     const exchangeHistory: string[] = [];
                                                                                                                                                                                                                                             ↑
     // ── REPL ─────────────────────────────────────────────────────────────────
     while (problemIdx < PROBLEMS.length) {                                                                                                                                                                                                  ↑
       const problem = PROBLEMS[problemIdx];
       if (problem === undefined) break;                                                                                                                                                                                                     ↑

       console.log(`\n📚 Problem ${problemIdx + 1}/${PROBLEMS.length}: ${problem.text}`);                                                                                                                                                    ↑

       let solvedThisProblem = false;                                                                                                                                                                                                        ↑

       while (!solvedThisProblem) {                                                                                                                                                                                                          ↑
         const userInput = (await readline.question("Your answer: ")).trim();
                                                                                                                                                                                                                                             ↑
         if (userInput.toLowerCase() === "quit" || userInput.toLowerCase() === "exit") {
           await finalize(session, sessionSvc, finalSvc, profileSvc, profile);                                                                                                                                                               ↑
           printMasterySummary(profile);
           readline.close();                                                                                                                                                                                                                 ↑
           return;
         }                                                                                                                                                                                                                                   ↑

         attemptsThisStep++;                                                                                                                                                                                                                 ↑

         // Log student event                                                                                                                                                                                                                ↑
         await sessionSvc.appendEvent(session.sessionId, {
           role: "student",                                                                                                                                                                                                                  ↑
           eventType: "message",
           content: userInput,                                                                                                                                                                                                               ↑
         });
                                                                                                                                                                                                                                             ↑
         // Get current skill BKT state
         const skill = profile.getSkillState(problem.skill);                                                                                                                                                                                 ↑
         if (!skill) throw new Error(`Skill ${problem.skill} not in profile`);
                                                                                                                                                                                                                                             ↑
         const bktState: BktSkillState = {
           masteryProbability: skill.masteryProbability,                                                                                                                                                                                     ↑
           slipRate: skill.slipRate,
           guessRate: skill.guessRate,                                                                                                                                                                                                       ↑
           successes: 0,
           failures: 0,                                                                                                                                                                                                                      ↑
         };
                                                                                                                                                                                                                                             ↑
         // DSR: decide hint tier
         const frustrated = profile.behavioral.frustrationIndex >= 0.75;                                                                                                                                                                     ↑
         const tierResult = selectSocraticTier(
           { tier: currentTier, attemptsThisStep, stuck: attemptsThisStep > 2 },                                                                                                                                                             ↑
           { masteryProbability: skill.masteryProbability,
             frustrationIndex: profile.behavioral.frustrationIndex,                                                                                                                                                                          ↑
             errorType: "procedural" },
         );                                                                                                                                                                                                                                  ↑
         currentTier = tierResult.tier;
                                                                                                                                                                                                                                             ↑
         // DSR: scaffolding controls
         const controls = computeScaffoldingAndTone(                                                                                                                                                                                         ↑
           skill.masteryProbability,
           profile.behavioral.frustrationIndex,                                                                                                                                                                                              ↑
           profile.cognitive.metacognition.helpSeeking,
         );                                                                                                                                                                                                                                  ↑

         // Update frustration heuristic (more attempts → more frustration)                                                                                                                                                                  ↑
         if (attemptsThisStep > 2) {
           profile.adjustFrustration(0.05);                                                                                                                                                                                                  ↑
         }
                                                                                                                                                                                                                                             ↑
         // Build prompt
         const view     = projSvc.derivePromptView(profile);                                                                                                                                                                                 ↑
         const sanitized = projSvc.sanitizeFreeTextFields(view);
         const exchange  = exchangeHistory.slice(-6).join("\n");                                                                                                                                                                             ↑
         const envelope  = projSvc.buildPromptEnvelope(sanitized, {
           currentProblem: problem.text,                                                                                                                                                                                                     ↑
           sessionExchange: exchange,
         });                                                                                                                                                                                                                                 ↑

         // Add hint tier instruction to system prompt                                                                                                                                                                                       ↑
         const tierNote =
           tierResult.tier === 1 ? "Use only a guiding question (Tier 1 — Socratic)." :                                                                                                                                                      ↑
           tierResult.tier === 2 ? "Give a partial worked example, then ask a question (Tier 2)." :
                                   "Walk through the full solution with the student (Tier 3 — direct).";                                                                                                                                     ↑

         const systemWithTier = envelope.systemPrompt + `\n\nHINT POLICY: ${tierNote}`;                                                                                                                                                      ↑

         // Call Claude                                                                                                                                                                                                                      ↑
         process.stdout.write("\n🤖 Tutor: ");
         let assistantReply = "";                                                                                                                                                                                                            ↑
         try {
           const stream = anthropic.messages.stream({                                                                                                                                                                                        ↑
             model: "claude-haiku-4-5-20251001",
             max_tokens: 512,                                                                                                                                                                                                                ↑
             system: systemWithTier,
             messages: [{ role: "user", content: envelope.userPrompt + `\n\nStudent's latest answer: ${userInput}` }],                                                                                                                       ↑
           });
           for await (const chunk of stream) {                                                                                                                                                                                               ↑
             if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
               process.stdout.write(chunk.delta.text);                                                                                                                                                                                       ↑
               assistantReply += chunk.delta.text;
             }                                                                                                                                                                                                                               ↑
           }
           console.log("\n");                                                                                                                                                                                                                ↑
         } catch (err) {
           console.error("\nClaude API error:", err);                                                                                                                                                                                        ↑
           assistantReply = "I encountered an issue. Please try again.";
         }                                                                                                                                                                                                                                   ↑

         // Log assistant event                                                                                                                                                                                                              ↑
         await sessionSvc.appendEvent(session.sessionId, {
           role: "assistant",                                                                                                                                                                                                                ↑
           eventType: "message",
           content: assistantReply,                                                                                                                                                                                                          ↑
         });
                                                                                                                                                                                                                                             ↑
         exchangeHistory.push(`Student: ${userInput}`);
         exchangeHistory.push(`Tutor: ${assistantReply}`);                                                                                                                                                                                   ↑

         // Detect correctness from Claude's reply                                                                                                                                                                                           ↑
         const correctSignals = ["correct", "right", "exactly", "well done", "great job", "that's it", "yes"];
         const isCorrect = correctSignals.some(s => assistantReply.toLowerCase().includes(s));                                                                                                                                               ↑

         // BKT update                                                                                                                                                                                                                       ↑
         const updatedBkt = computeBktUpdate(
           bktState,                                                                                                                                                                                                                         ↑
           { correct: isCorrect, hintTier: currentTier },
           BKT_PARAMS[problem.kcTier],                                                                                                                                                                                                       ↑
         );
         profile.updateSkillMastery(problem.skill, updatedBkt.masteryProbability);                                                                                                                                                           ↑

         // Reset frustration on correct answer                                                                                                                                                                                              ↑
         if (isCorrect) {
           profile.adjustFrustration(-0.10);                                                                                                                                                                                                 ↑
           profile.recordFailedAttempt(); // resets counter
           const masteryResult = computeMasteryThreshold(                                                                                                                                                                                    ↑
             updatedBkt, problem.kcTier,
             { consecutiveAtMastery: isCorrect ? attemptsThisStep : 0,                                                                                                                                                                       ↑
               sessionsAboveThreshold: 1,
               tier3Supported: currentTier === 3 },                                                                                                                                                                                          ↑
           );
           if (masteryResult.mastered) {                                                                                                                                                                                                     ↑
             console.log(`✅ Mastery achieved for ${problem.skill} (P(L)=${updatedBkt.masteryProbability.toFixed(3)})`);
           }                                                                                                                                                                                                                                 ↑
           solvedThisProblem = true;
           attemptsThisStep = 0;                                                                                                                                                                                                             ↑
           currentTier = 0;
           exchangeHistory.length = 0;                                                                                                                                                                                                       ↑
           problemIdx++;
         } else {                                                                                                                                                                                                                            ↑
           profile.recordFailedAttempt();
         }                                                                                                                                                                                                                                   ↑
       }
     }                                                                                                                                                                                                                                       ↑

     console.log("\n🎓 You've completed all problems!");                                                                                                                                                                                     ↑
     await finalize(session, sessionSvc, finalSvc, profileSvc, profile);
     printMasterySummary(profile);                                                                                                                                                                                                           ↑
     readline.close();
   }                                                                                                                                                                                                                                         ↑

   async function finalize(                                                                                                                                                                                                                  ↑
     session: import("@domain/session/Session.ts").Session,
     sessionSvc: import("@services/SessionService.ts").SessionService,                                                                                                                                                                       ↑
     finalSvc: import("@services/FinalizerService.ts").FinalizerService,
     profileSvc: import("@services/ProfileService.ts").ProfileService,                                                                                                                                                                       ↑
     profile: import("@domain/profile/LearningProfileStore.ts").LearningProfileStore,
   ) {                                                                                                                                                                                                                                       ↑
     const ended  = await sessionSvc.endSession(session.sessionId);
     const events = await sessionSvc.getSessionEvents(ended.sessionId);                                                                                                                                                                      ↑
     const patch  = await finalSvc.finalizeSessionToPatch(ended, events, profile);
     const result = await finalSvc.applyPatchCompareAndSwap(profile, patch);                                                                                                                                                                 ↑
     if (result.applied) {
       console.log(`\n💾 Profile updated to version ${result.newProfileVersion}.`);                                                                                                                                                          ↑
     }
   }                                                                                                                                                                                                                                         ↑

   function printMasterySummary(                                                                                                                                                                                                             ↑
     profile: import("@domain/profile/LearningProfileStore.ts").LearningProfileStore,
   ) {                                                                                                                                                                                                                                       ↑
     console.log("\n── Session Mastery Summary ──────────────────────");
     for (const [skillId, skill] of Object.entries(profile.cognitive.skills)) {                                                                                                                                                              ↑
       const pct = (skill.masteryProbability *100).toFixed(1);
       const bar = "█".repeat(Math.round(skill.masteryProbability* 20)).padEnd(20, "░");                                                                                                                                                    ↑
       console.log(`${skillId.padEnd(20)} ${bar} ${pct}%`);
     }                                                                                                                                                                                                                                       ↑
     console.log("─────────────────────────────────────────────────\n");
   }                                                                                                                                                                                                                                         ↑

   main().catch(console.error);                                                                                                                                                                                                              ↑

   1. Running the terminal                                                                                                                                                                                                                  ↑

# From the project root (/home/bryson-bodner/CodeProjects/VirtualTutor)                                                                                                                                                                   ↑

   npx tsx src/main.ts
                                                                                                                                                                                                                                             ↑
   tsx resolves the @domain/*, @services/*, @algorithms/* path aliases from tsconfig.json
   automatically.                                                                                                                                                                                                                            ↑

   1. TypeScript verification                                                                                                                                                                                                               ↑

   After implementing, run:                                                                                                                                                                                                                  ↑
   npx tsc --noEmit
   Fix any type errors before considering the task complete. Common pitfalls with this tsconfig:                                                                                                                                             ↑

- noUncheckedIndexedAccess: true — every Record<K,V> lookup returns V | undefined; add null guards.
- exactOptionalPropertyTypes: true — use spread ...(x !== undefined && { key: x }) instead of                                                                                                                                             ↑
   assigning undefined to optional properties.
- verbatimModuleSyntax: true — use import type for type-only imports; switch to value import                                                                                                                                              ↑
   when new is used.
                                                                                                                                                                                                                                             ↑

   1. Files modified / created
                                                                                                                                                                                                                                             ↑
   ┌────────────────────────────────────────────────┬─────────────────────────────────────────┐                                                                                                                                              ↑
   │                      File                      │                 Action                  │
 ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/algorithms/BKT/BayesianKnowledgeTracing.ts │ Fill 2 bodies                           │
   ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/algorithms/FSRS/FreeSpacedRepetition.ts    │ Fill 3 bodies                           │
 ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/algorithms/DSR/DynamicScaffolding.ts       │ Fill 3 bodies                           │
   ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/domain/profile/LearningProfileStore.ts     │ Fill 2 bodies                           │
   ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
src/services/PromptProjectionService.ts        │ Fill 4 bodies + add crypto import       │
   ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/services/FinalizerService.ts               │ Fill 2 bodies + fix ProfilePatch import │
 ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/services/ProfileService.ts                 │ Fill 3 bodies + add in-memory state     │
   ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/services/SessionService.ts                 │ Fill 4 bodies + add in-memory state     │
 ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ src/main.ts                                    │ Create (new file)                       │
   ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ .env                                           │ Add ANTHROPIC_API_KEY placeholder       │
 ├────────────────────────────────────────────────┼─────────────────────────────────────────┤
   │ package.json                                   │ npm install @anthropic-ai/sdk adds it   │
