# IMPORTANT
One thing to flag before you upload R4: Dataset 009 reframes the entire purpose of the mastery matrix in a way that has architectural 
implications. The mastery score is an intermediate metric — the metacognitive regulation profile is the real long-term outcome. 
When C2 builds the Profile Service, the schema needs a dedicated metacognitive regulation sub-profile separate from the mastery matrix. 
Worth keeping that in mind as a note when we get to P1's schema review with the coding agents.
---
**P1 — Theory Architect | Omega Logic Tutor Engine**

Let's lock every theoretical decision before a single line of code gets written. I'll work through this systematically.

---

## 1. CORE SYSTEM PHILOSOPHY

**The Fundamental Constraint:**
The tutor never stores conversation. It stores *understanding of the student.* These are not the same thing.

Every session is a fresh conversation between the LLM and a rich, structured representation of how that student's brain works. The profile is the memory. The conversation is disposable.

**The Three Laws of the Tutor Engine:**
1. Never give the answer. Guide toward it through the student's own cognitive patterns.
2. Never grow the context window with history. Inject only the profile, the current problem, and the current session exchange.
3. Never update the profile mid-session. Wait until session end, extract deltas only, patch the profile atomically.

---

## 2. THE LEARNING PROFILE — FULL SCHEMA THEORY

The profile has four distinct layers:

**Layer 1 — Cognitive Fingerprint** *(set at intake, refined over time)*
```
cognitiveFingerprint:
  primaryLearningMode: visual | algebraic | narrative | example-first | failure-first
  processingStyle: gestalt-first | sequential | mixed
  workingMemoryLoad: low | medium | high
    (how much context they can hold before confusion sets in)
  abstractionTolerance: concrete | semi-abstract | abstract
    (can they handle y = mx + b symbolically or do they need graph-first?)
  frustrationThreshold: low | medium | high
    (how quickly does confusion turn into shutdown?)
```

**Layer 2 — Mastery Matrix** *(grows dynamically)*
```
masteryMatrix:
  concepts:
    - id: concept-id
      name: string
      masteryLevel: 0.0 - 1.0
        (Bayesian Knowledge Tracing score)
      exposureCount: integer
      lastSeen: timestamp
      commonErrors: string[]
        (specific mistakes this student makes on this concept)
      breakthroughPattern: string
        (what finally made it click — stored as a note)
```

**Layer 3 — Friction Map** *(grows dynamically)*
```
frictionMap:
  - conceptId: string
  - frictionType: procedural | conceptual | motivational | language
  - triggerPattern: string
    (what kind of problem surface triggers this friction)
  - successfulWorkarounds: string[]
    (what the tutor tried that worked)
  - failedWorkarounds: string[]
    (what made it worse — never try again)
```

**Layer 4 — Motivational Profile** *(set at intake, refined)*
```
motivationalProfile:
  selfEfficacyLevel: low | medium | high
  mindsetType: fixed | growth | mixed
  preferredReinforcementStyle: encouragement | challenge | neutral
  mathAnxietyIndicators: string[]
    (specific phrases or patterns that signal anxiety)
  engagementTriggers: string[]
    (what gets them leaning in)
```

---

## 3. INTAKE QUIZ — THEORY

The intake quiz has one job: populate Layer 1 and Layer 4 well enough that the tutor can function on Day 1 before any session data exists.

**Structure:**
- 8-12 questions maximum. Middle schoolers will abandon anything longer.
- Questions are scenario-based not self-report. Never ask "are you a visual learner?" Ask "if you were learning a new math concept, would you rather see a graph, an equation, or a worked example?"
- Questions map directly to profile fields — every question has a deterministic output that populates a specific field.
- After quiz completion, the psychology RAG is queried with the fingerprint to generate the initial tutor instruction set for that student.

**Psychology RAG Query at intake:**
```
Input: cognitiveFingerprint + motivationalProfile
Output: tutorInstructionBlock
  - preferredHintStyle
  - questioningApproach  
  - paceRecommendation
  - languageRegister
  - warningFlags (e.g. "this student shows math anxiety indicators — avoid time pressure framing")
```

This `tutorInstructionBlock` gets stored directly in the profile and is injected into every session prompt.

---

## 4. THE STATELESS SESSION — FULL THEORY

**What gets injected into the LLM context at session start:**
```
SYSTEM PROMPT STRUCTURE:
[1] Tutor Identity Block
    — You are a Socratic math tutor for 7th grade algebra
    — You never give answers
    — You guide using the student's specific cognitive patterns

[2] Student Profile Injection
    — cognitiveFingerprint (full)
    — motivationalProfile (full)
    — tutorInstructionBlock (from RAG)
    — relevant masteryMatrix entries for today's concept only
    — relevant frictionMap entries for today's concept only

[3] Session Context
    — Today's concept: [e.g. understanding slope in y = mx + b]
    — Problem set for today: [injected]
    — Session goal: [what mastery level we're targeting]

[4] Behavioral Constraints
    — Never state the answer
    — If student is stuck after 3 hints, escalate hint specificity
      but still do not solve
    — If frustration indicators detected, shift to encouragement mode
    — Mirror the student's language register
```

**What is NOT in the context:**
- Previous session conversations
- Previous session raw exchanges
- Any message older than the current session

**Why this works:**
The LLM doesn't need to remember what the student said last Tuesday. It needs to know *how that student thinks.* That's what the profile provides. The conversation is ephemeral. The understanding is permanent.

---

## 5. THE XML DELTA SYSTEM — FULL THEORY

This is the most technically critical piece. Here's exactly how it works:

**At session end, a summarization prompt runs:**
```
Input to summarization LLM call:
  — Full session transcript (this is the ONE time we use the full conversation)
  — Current student profile (read-only reference)

Output: XML delta document
```

**XML Delta Structure:**
```xml
<profileDelta studentId="..." sessionId="..." timestamp="...">

  <masteryUpdates>
    <concept id="slope-understanding">
      <masteryDelta>+0.12</masteryDelta>
      <newErrors>
        <error>Confuses slope with y-intercept when m is negative</error>
      </newErrors>
      <breakthroughPattern>
        Responded well to graph-first demonstration before equation
      </breakthroughPattern>
    </concept>
  </masteryUpdates>

  <frictionUpdates>
    <friction conceptId="slope-understanding">
      <newWorkaround success="true">
        Asked student to describe what happens to y as x increases by 1
      </newWorkaround>
      <newWorkaround success="false">
        Tried abstract delta notation — caused shutdown
      </newWorkaround>
    </friction>
  </frictionUpdates>

  <motivationalUpdates>
    <selfEfficacyShift>+1</selfEfficacyShift>
    <newAnxietyIndicator>
      Hesitates when problem uses negative numbers
    </newAnxietyIndicator>
  </motivationalUpdates>

  <cognitiveRefinements>
    <refinement field="abstractionTolerance">
      Evidence suggests lower than intake indicated — recommend concrete-first
    </refinement>
  </cognitiveRefinements>

</profileDelta>
```

**The differential backup rule:**
Before applying any delta, the system checks the current profile. If the delta value already exists in the profile — it is discarded. Only net-new information patches through. This prevents the profile from becoming noisy with redundant data over time.

**Profile update is atomic:**
The entire delta applies in one transaction. Partial updates never happen. If the delta application fails, the profile stays unchanged and the delta is queued for retry.

---

## 6. SOCRATIC BEHAVIOR CONSTRAINTS — THEORY

For 7th grade algebra specifically, the tutor operates on a **3-tier hint system:**

**Tier 1 — Conceptual Redirect**
Student is stuck. Tutor asks a question that redirects attention to the underlying concept without touching the problem.
```
Example: "Before we solve this, tell me — what does the slope 
tell us about how a line moves?"
```

**Tier 2 — Scaffolded Decomposition**
Student is still stuck after Tier 1. Tutor breaks the problem into a smaller sub-problem the student can solve.
```
Example: "Let's ignore the full equation for now. If x goes 
from 0 to 1, and m is 3, what happens to y?"
```

**Tier 3 — Worked Parallel**
Student is still stuck after Tier 2. Tutor solves a *different but parallel* problem fully, then hands the original back.
```
Example: "Let me show you a similar one. [solves y = 2x + 1 
for a specific point]. Now you try yours using the same steps."
```

**After Tier 3 — if still stuck:**
Session flags the concept as high-friction. Delta XML notes it. Next session starts with that concept from scratch using a completely different approach based on what the frictionMap says hasn't been tried yet.

**Hard rules that never break:**
- Never state the answer to the current problem
- Never skip tiers (always start at Tier 1)
- If math anxiety indicators fire mid-session — pause the hint system, shift to motivational mode, return to Tier 1 when student re-engages
- If student asks directly "just tell me the answer" — acknowledge, empathize, redirect: *"I know it's frustrating — let's try one smaller piece together"*

---

## 7. PSYCHOLOGY RAG — INTEGRATION POINTS

The RAG is queried at exactly three moments:

**Query Point 1 — Intake completion**
Builds the initial `tutorInstructionBlock` from the cognitive fingerprint and motivational profile.

**Query Point 2 — Session start**
Refreshes the `tutorInstructionBlock` if the profile has been updated since the last session. Pulls any new research relevant to the student's current friction patterns.

**Query Point 3 — Delta application**
When a delta reveals a new friction type or cognitive pattern not previously seen, the RAG is queried for research-backed approaches to that specific pattern.

---

## 8. SYSTEM BOUNDARIES — WHAT THIS MVP DOES NOT DO

Locking these out of scope now prevents scope creep from killing your timeline:

- ❌ No professor dashboard (V2)
- ❌ No classroom aggregation (V2)
- ❌ No parent-facing features
- ❌ No multi-subject support (7th grade math only)
- ❌ No voice interface
- ❌ No real-time collaboration between students
- ❌ No adaptive problem generation (problems are pre-loaded for MVP)
- ❌ No grading or scoring visible to student

---

## 9. KEY DECISIONS LOCKED BY P1

| Decision | Choice | Reason |
|---|---|---|
| Session memory | None — profile only | Prevents bloat |
| Profile storage | PostgreSQL + Prisma | Known stack |
| Delta format | XML | Boss's RAG accepts structured data |
| Delta application | Atomic transaction | Data integrity |
| Hint system | 3-tier Socratic | Age-appropriate for 7th grade |
| RAG query points | 3 defined moments | Prevents over-querying |
| LLM | Claude API via Vercel AI SDK | Reliability + speed |
| Problem set | Pre-loaded for MVP | Scope control |
| Auth | JWT username/password | Simple, fast to build |
| Deployment | Railway | One-command, private |

---

**P1 is complete.**

Every agent downstream now has an unambiguous blueprint. Nothing is left open that would cause a coding agent to make an assumption.

---

**Ready to run R1 — Learning Style Frameworks.** This will be the first research deep dive producing a formatted `.txt` file ready for upload to your boss's RAG under `tutor-7math-learningstyles-001` through however many datasets the research yields.

Say go and I'll run it.