# VirtualTutor Backend — Scaffold Handoff

This document hands the scaffolded backend (built per `ALGORITHM_SCAFFOLD_PLAN.md`) to whoever
implements the 17 algorithm/service contracts and draws the architecture diagrams. The scaffold
is fully typed and documented; **no algorithm bodies are implemented** — every stub is a
`// TODO: implement` with a complete signature, JSDoc contract, and (where relevant) named
constants sourced from the RAG datasets.

---

## 1. Plain-English summary

VirtualTutor is an AI math tutor that **never stores conversations — it stores understanding of
the student**. Each session is a fresh, disposable conversation between an LLM and a structured
`LearningProfileStore` (the canonical, persisted model of how that student's brain works). The
backend's job is to:

1. **Build** an initial profile from an intake quiz (`ProfileService.buildInitialProfile`).
2. **Run sessions** without ever mutating the canonical profile mid-conversation — only an
   ephemeral Redis-backed conversation buffer (`RedisSessionCache`) and an append-only
   `SessionEvent` log move during a live session.
3. **Project** a sanitized, confidence-gated view of the profile into every prompt
   (`PromptProjectionService`), keeping backend-internal fields (`evidenceLog`,
   `dataRetentionTtl`, raw `gradeLevel`, sub-0.60-confidence traits) out of the model's hands.
4. **Finalize** each session into a `ProfilePatch` — a diff describing what changed — and apply it
   atomically via compare-and-swap on `profileVersion` (`FinalizerService`,
   `LearningProfileStore.applyPatch`).

Three algorithm families drive the math behind all of this:
- **BKT** (Bayesian Knowledge Tracing) — in-session mastery inference, the "is this KC known yet"
  latent-state model, plus the prerequisite gate (flags.MD flag 1) and 16-KC tracking (flag 3).
- **FSRS** (Free Spaced Repetition Scheduling) — long-term retention layer; decides when a
  mastered skill needs to be reviewed again before it's forgotten.
- **DSR** (Dynamic Scaffolding & Socratic control) — server-owned tutoring policy: which Socratic
  hint tier to use, how much scaffolding/tone adjustment to apply, and whether the student is
  stuck in an unproductive feedback loop (flag 4).

The schema also encodes flag 2: a dedicated `MetacognitionState` sub-profile, separate from the
mastery matrix, because the mastery score is an *intermediate* metric — metacognitive regulation
is the real long-term outcome (dataset 009 / firstDocument.md).

---

## 2. The 8 diagrams to build

Use the reference sheet's diagram pack/checklist (`VirtualTutor backend project reference sheet.docx`)
as the canonical shape/field source. Build:

1. **C4 Level 1 — System Context** — VirtualTutor backend, the student, the LLM provider, Postgres,
   Redis, and the psychology RAG.
2. **C4 Level 2 — Container** — API layer, the five services, Postgres (via Prisma), Redis session
   cache, and the algorithm modules as a "policy/inference" container.
3. **C4 Level 3 — Component** — inside the service container: `AccountService`, `ProfileService`,
   `SessionService`, `PromptProjectionService`, `FinalizerService`, and how each calls into
   `domain/*` and `algorithms/*`.
4. **UML Class Diagram** — the domain layer: `Account`/`Consent`, `LearningProfileStore` (+
   `KCState`, `MetacognitionState`, `SkillState`, `CognitiveState`, `BehavioralState`,
   `HistoricalState`), `LearningProfilePromptView`/`LearningProfilePayload`, `ProfilePatch`/
   `PatchOperation`, `Session`, `SessionEvent`, `IntakeQuiz`.
5. **Sequence Diagram — one full session lifecycle** — start session → live message exchange
   (Redis buffer + `SessionEvent` log + `PromptProjectionService` envelope) → end session →
   `FinalizerService.finalizeSessionToPatch` → `applyPatchCompareAndSwap` → profile updated,
   Redis key deleted.
6. **Flowchart — the BKT/DSR scoring decision path** — from a scored student response through
   `computeBktUpdate` → `computeMasteryThreshold` → `selectSocraticTier` →
   `computeScaffoldingAndTone`, including the prerequisite-gate branch (`checkPrerequisiteGate`).
7. **ER Diagram** — the Prisma schema: `User`, `Student`, `LearningProfile`, `IntakeQuiz`,
   `Session`, `SessionEvent`, `ProfilePatch`, `SystemErrorLog`, with the new enums
   (`ProfileStatus`, `SessionStatus`, `EventRole`, `EventType`) and FK relationships.
8. **State Machine — Session & ProfileStatus lifecycles** — `Session`:
   `active → ended → finalized` / `→ error`; `Student.profileStatus`:
   `pendingQuiz → building → ready ⇄ archived` / `→ buildFailed`.

---

## 3. Source file paths per diagram

| Diagram | Primary source files |
|---|---|
| C4 L1 (Context) | `prisma/schema.prisma`, `src/db/redis/RedisSessionCache.ts`, `firstDocument.md` |
| C4 L2 (Container) | `src/services/*.ts`, `src/algorithms/**/*.ts`, `src/db/redis/RedisSessionCache.ts`, `prisma/schema.prisma` |
| C4 L3 (Component) | `src/services/AccountService.ts`, `src/services/ProfileService.ts`, `src/services/SessionService.ts`, `src/services/PromptProjectionService.ts`, `src/services/FinalizerService.ts` |
| UML Class | `src/domain/account/AccountBase.ts`, `src/domain/account/Consent.ts`, `src/domain/profile/LearningProfileStore.ts`, `src/domain/profile/LearningProfilePromptView.ts`, `src/domain/profile/ProfilePatch.ts`, `src/domain/session/Session.ts`, `src/domain/session/SessionEvent.ts`, `src/domain/intake/IntakeQuiz.ts` |
| Sequence (session lifecycle) | `src/services/SessionService.ts`, `src/db/redis/RedisSessionCache.ts`, `src/services/PromptProjectionService.ts`, `src/services/FinalizerService.ts`, `src/domain/session/Session.ts`, `src/domain/session/SessionEvent.ts` |
| Flowchart (BKT/DSR scoring path) | `src/algorithms/BKT/BayesianKnowledgeTracing.ts`, `src/algorithms/DSR/DynamicScaffolding.ts`, `src/domain/profile/LearningProfileStore.ts` (`checkPrerequisiteGate`) |
| ER Diagram | `prisma/schema.prisma` |
| State Machine | `src/domain/session/Session.ts`, `src/domain/account/AccountBase.ts` (`ProfileStatus`), `prisma/schema.prisma` (`SessionStatus`, `ProfileStatus` enums) |

---

## 4. The 17 stubs — locations & RAG citations

| # | Method | File | RAG dataset citation(s) |
|---|---|---|---|
| 1 | `computeBktUpdate` | `src/algorithms/BKT/BayesianKnowledgeTracing.ts` | studentmodeling-001/002/003/004/006/008; hintsystems-006/007/008 |
| 2 | `computeMasteryThreshold` | `src/algorithms/BKT/BayesianKnowledgeTracing.ts` | studentmodeling-001/003; hintsystems-007/008; flags.MD flag 1 & 3 |
| 3 | `computeFsrsState` | `src/algorithms/FSRS/FreeSpacedRepetition.ts` | studentmodeling-004 (forgetting curve); cognition-006 (spaced retrieval) |
| 4 | `computeRetrievability` | `src/algorithms/FSRS/FreeSpacedRepetition.ts` | studentmodeling-004; cognition-006 |
| 5 | `isDueForReview` | `src/algorithms/FSRS/FreeSpacedRepetition.ts` | studentmodeling-004; cognition-006 |
| 6 | `computeScaffoldingAndTone` | `src/algorithms/DSR/DynamicScaffolding.ts` | hintsystems-003/005/006/011; feedback-001/002/003/007/008 |
| 7 | `selectSocraticTier` | `src/algorithms/DSR/DynamicScaffolding.ts` | hintsystems-003/005/006/011; feedback-001/002/003 |
| 8 | `detectStuckLoop` | `src/algorithms/DSR/DynamicScaffolding.ts` | feedback-008; flags.MD flag 4 |
| 9 | `buildInitialProfile` | `src/services/ProfileService.ts` | studentmodeling-002 (BKT_PARAMS priors); firstDocument.md (cognitive fingerprint / intake mapping); flags.MD flag 2 (metacognition sub-profile) |
| 10 | `applyPatch` | `src/domain/profile/LearningProfileStore.ts` | flags.MD flag 1 & 3; `src/services/FinalizerService.ts` (`applyPatchCompareAndSwap`) |
| 11 | `checkPrerequisiteGate` | `src/domain/profile/LearningProfileStore.ts` | algebraerrors-003 (Variable Confusion — 0.75 prerequisite gate); flags.MD flag 1 |
| 12 | `derivePromptView` | `src/services/PromptProjectionService.ts` | ALGORITHM_SCAFFOLD_PLAN.md §1 (global normalizations / confidence gating); flags.MD flag 2 |
| 13 | `sanitizeFreeTextFields` | `src/services/PromptProjectionService.ts` | ALGORITHM_SCAFFOLD_PLAN.md §1 (`blockFreeTextInjection` / indirect prompt-injection defense) |
| 14 | `buildPromptEnvelope` | `src/services/PromptProjectionService.ts` | firstDocument.md (Three Laws — inject only profile + current problem + current exchange) |
| 15 | `validateModelResponse` | `src/services/PromptProjectionService.ts` | firstDocument.md (structured XML delta contract); flags.MD flag 4 (`feedbackLoopType`/`sessionFlag` shape validation) |
| 16 | `finalizeSessionToPatch` | `src/services/FinalizerService.ts` | studentmodeling-* (BKT evidence), studentmodeling-004 (FSRS evidence), hintsystems-*/feedback-* (DSR evidence); flags.MD flags 1–4 |
| 17 | `applyPatchCompareAndSwap` | `src/services/FinalizerService.ts` | `src/domain/profile/ProfilePatch.ts` (`hasConflict`); `src/domain/profile/LearningProfileStore.ts` (`profileVersion`, `applyPatch`) |

---

## 5. Reading order

1. `firstDocument.md` — core philosophy (the Three Laws), the four-layer profile theory, intake
   quiz theory.
2. `flags.MD` — the four architectural flags (prerequisite gate, metacognition sub-profile,
   16-KC decomposition, feedback-loop detection) that the schema and algorithms encode.
3. **Reference-sheet object notes** (`VirtualTutor backend project reference sheet.docx`) — the
   canonical 6-part model and the source of truth for every field shape in this scaffold.
4. `prisma/schema.prisma` — the persisted shape of everything: enums, `Student`,
   `LearningProfile`, `Session`, `SessionEvent`, `ProfilePatch`.
5. `src/domain/profile/LearningProfileStore.ts` — the canonical in-memory model, `KCState` /
   `MetacognitionState` additions, and the two domain-level stub contracts
   (`applyPatch`, `checkPrerequisiteGate`).
6. `src/services/*.ts` — the five service contracts and how they own/don't-own each slice of the
   pipeline (each file's JSDoc header states this explicitly).
7. `src/algorithms/{BKT,FSRS,DSR}/*.ts` — the three algorithm families: full typed contracts,
   named constants pulled from the RAG datasets, empty `// TODO: implement` bodies ready for the
   math.

---

## Notes for the implementer

- `npx prisma migrate dev --name "add-session-event-patch-models"` has **not** been run against a
  live database in this environment (no local Postgres/Docker available). The schema has been
  validated with `npx prisma validate` and is ready to migrate against a running database.
- Legacy reference directories (`AccountConsentState/`, `LearningProfile/`, `DBEngines/`, `Auth/`,
  `PromptEngine/`, `models.ts`) were intentionally left in place for comparison and are not wired
  into the new `src/` tree.
