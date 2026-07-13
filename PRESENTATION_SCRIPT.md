# VirtualTutor — CEO Presentation Script
**~25 minutes · presenter notes, read top to bottom, timing marks in brackets**

Everything in this script is checked against the actual codebase and today's audit findings
(`AUDIT_EXPORT_2026-07-13.md`, `DATABASE_API_HOOKS.md` — both in this repo if you want to hand
them over as backup material). Nowhere here overstates what's built. Where something is designed
but not yet live, the script says so explicitly — that honesty is itself part of the pitch.

---

## 0. Cold open [~1 min]

> "I want to start with the one-sentence version, because everything else is detail on top of
> this: **VirtualTutor doesn't remember conversations. It remembers students.**
>
> Every AI tutoring product on the market right now is a chatbot with a system prompt bolted on.
> They store chat history and hope the model 'remembers' the student across sessions by re-reading
> transcripts. That approach doesn't scale, doesn't improve over time in any structured way, and
> can't tell you *why* a student is stuck — only *that* they're stuck.
>
> We built something structurally different. I'm going to walk you through the architecture, show
> it running against the real Claude API, and then show you the engineering process we ran just
> today to pressure-test it before it goes anywhere near a real student."

---

## 1. The problem, and why the obvious approach fails [~2-3 min]

> "Picture a 7th grader working through algebra. A generic chatbot tutor sees: the current message,
> maybe the last few turns, and a generic 'be a helpful tutor' instruction. It has no idea this
> particular student confuses slope with y-intercept whenever the slope is negative, that they shut
> down when a problem uses abstract delta notation, or that they had a breakthrough last week when
> a concept was shown graph-first instead of as an equation.
>
> The naive fix is 'just give the model the whole conversation history.' That fails in three ways:
> it's expensive — context grows linearly forever — it's noisy — the model re-reads a hundred
> irrelevant turns to find the one pattern that matters — and it's not even the right data. A
> transcript tells you *what was said*. It doesn't tell you *how this student's brain processes new
> information*. Those are different objects, and conflating them is why generic AI tutors plateau."

---

## 2. The core architectural bet: profile, not transcript [~3-4 min]

> "So here's the bet we made at the design stage, and it's the thing I'd want you to remember out
> of this whole meeting if nothing else does. We call it the Three Laws of the tutor engine:
>
> **One — never give the answer.** The tutor guides the student toward it through their own
> cognitive patterns. It's Socratic by construction, not by prompt-engineering luck.
>
> **Two — never grow the context window with history.** Every session injects exactly three things:
> the student's profile, the current problem, and the current session's exchange so far. Nothing
> older. The model never re-reads last Tuesday's conversation.
>
> **Three — never update the profile mid-session.** The profile — the thing that actually
> represents 'how this student thinks' — only changes once, at session end, through a controlled,
> atomic patch. Never live, never partial.
>
> What that buys us: session cost and latency are flat regardless of how long a student has been
> using the product — session 1 and session 100 cost the same to run. The model's attention stays
> on the one thing that matters — the current problem, filtered through what we already know about
> the student — instead of being diluted across a growing history. And the profile becomes a real,
> queryable asset over time: a structured, evolving model of that student's mastery and learning
> style, not a pile of chat logs someone would have to re-summarize to get any value out of."

---

## 3. What's actually inside the profile, and the three algorithms doing the work [~5-6 min]

> "The profile isn't a vibe — it's a typed data structure with three layers of intelligence
> feeding it, all implemented, tested, and running today.
>
> **First: Bayesian Knowledge Tracing — BKT.** This is the mastery-inference engine. Every time a
> student answers a problem, BKT updates a probability — 'how likely is it this student actually
> knows this skill' — using a formula that accounts for two nuisance parameters most tutoring
> products ignore: **guess rate** — could they have gotten it right by luck — and **slip rate** —
> could they have known it but made a careless mistake. That distinction matters pedagogically: a
> student who slips needs encouragement, a student who's guessing needs re-teaching, and a naive
> 'right or wrong' tracker treats them identically. We even built in *tiered* guess/slip rates that
> shift based on how much scaffolding we've already given the student and their current frustration
> level, so the confidence estimate adapts to the interaction, not just the raw answer.
>
> **Second: Free Spaced Repetition Scheduling — FSRS.** This is the forgetting curve. Mastering a
> skill once doesn't mean you'll retain it in three weeks. FSRS tracks retrievability over time and
> tells the system when a previously-mastered skill needs to resurface before the student forgets
> it — the same principle behind tools like Anki, but driven by our own mastery data instead of a
> flashcard deck.
>
> **Third: Dynamic Scaffolding and Socratic control — DSR.** This is the tutoring *policy* layer —
> it decides, turn by turn, how much help to give. It runs a three-tier hint system: Tier 1 is a
> guiding question that redirects attention to the underlying concept. Tier 2 breaks the problem
> into a smaller sub-piece the student can actually solve. Tier 3 walks a *parallel* problem fully,
> then hands the original back — it still never solves the student's actual problem for them. DSR
> also tracks frustration in real time and adjusts tone and scaffolding level accordingly, and it
> has a stuck-loop detector designed to notice when a student has been unproductive across multiple
> sessions in a row, so the system knows to try a fundamentally different approach rather than
> repeating what already isn't working.
>
> Those three algorithms — BKT, FSRS, DSR — are the actual IP here. They're implemented with full
> unit test coverage today, and they're what turns 'an LLM with a system prompt' into something
> that behaves like it has a theory of the individual student in front of it."

---

## 4. Live demo talking points [~3-4 min — pause here and actually run it]

> "Let me show you this running for real — this is hitting the live Claude API right now, not a
> canned recording."

**Run:** `npx tsx src/main.ts` in a terminal, and walk through it live. Talking points while it runs:

> "It seeds a demo student profile from an intake quiz, starts a session, and every answer the
> student types runs through BKT to update mastery, through DSR to pick the hint tier, and gets
> projected into a sanitized prompt that goes to Claude. Watch the response stream in — that's
> real-time Socratic tutoring, not a scripted response.
>
> One thing I want to point out deliberately: what you're *not* seeing in that prompt is the raw
> student ID, or any backend-internal scoring fields — the system hashes and filters what goes to
> the model on every single turn. That's not an accident; it's a dedicated service — we call it
> the Prompt Projection layer — whose entire job is drawing a hard line between 'what the backend
> knows' and 'what the model is allowed to see.'"

*(If you'd rather not risk a live demo in the room, cut this section to the screenshot/description
above and say "I'm happy to run this live afterward instead of risking a demo gremlin in front of
you" — that's a completely normal call to make and doesn't cost you credibility.)*

---

## 5. How we pressure-tested it — today's audit sprint [~4-5 min]

> "Now I want to shift from 'what we built' to 'how we know it's sound' — because I think this part
> is actually more important for you to see than the demo.
>
> This morning we ran eight independent audits in parallel against this exact codebase — not
> generic code review, but targeted interrogations of the riskiest parts of the system: the math
> behind BKT for edge-case correctness, the TypeScript compiler's strictest safety settings, the
> session-recovery logic under crashes and Ctrl+C, the database schema against the real data model,
> the tutoring state machine for deadlocks, the concurrency behavior when a patch gets applied to a
> student's profile, the prompt-injection surface against the LLM, and cross-platform Windows/Linux
> parity.
>
> Here's what that found, headline version:
>
> - One genuine mathematical soundness gap in the BKT engine — an unguarded invariant that, if a
>   parameter is ever retuned past a certain point, would silently make the model stop listening to
>   student answers. Not exploitable today with our shipped parameters, but now it's documented and
>   guarded rather than an invisible landmine.
> - A real, currently-exploitable prompt-injection path where a student could talk the model into
>   revealing parts of their own profile data. That's the single highest-priority security fix on
>   the list, and we know exactly which three lines of code close it.
> - A session-recovery gap — if a student hits Ctrl+C mid-session today, their progress isn't saved.
>   Straightforward fix, already scoped.
> - A live compiler bug — 21 type errors currently failing our strictest build settings, including
>   one duplicate code block that's a pure copy-paste artifact. Already being cleaned up as we
>   speak.
> - Confirmation that our database schema is solid where it exists, but — and I want to be direct
>   about this next part — persistence isn't wired up to a real database yet. More on that in a
>   second.
>
> The reason I'm walking you through bugs, not just wins, is that this is exactly the process I
> want running on this codebase permanently before anything reaches a real student. We found these
> ourselves, this morning, on our own schedule — not in production, not from a parent complaint,
> not from a security researcher. That's the difference between a team that ships fast and
> recklessly, and a team that ships fast and knows what it's shipping."

---

## 6. Where we honestly are right now [~2-3 min]

> "So let me give you the unvarnished status, because I'd rather you hear it from me than discover
> it later.
>
> What's real and running today: the full BKT/FSRS/DSR algorithm suite, fully tested. The prompt
> pipeline, live against Claude, with sanitization and confidence-gating built in. The database
> schema is designed and validated — eight tables, covering users, sessions, profiles, and the
> audit trail of every profile change.
>
> What's still scaffolded, not live: that schema isn't wired to a real Postgres database yet — the
> whole system currently runs on in-memory state, which is correct for proving the algorithms work,
> but means nothing persists between runs and there's no multi-student, multi-session concurrency
> handling yet. We also have a Redis-backed session cache fully written and ready to plug in, sitting
> unused right now. And account creation / auth is stubbed — signatures and types are locked, logic
> isn't written.
>
> I'm telling you this specifically because it's the difference between a prototype that *looks*
> done and a prototype that's *honestly* three focused engineering sprints from production-ready,
> with a known, itemized list of what those sprints are. That's a much stronger position to be in
> than pretending we're closer than we are."

---

## 7. What's next — the roadmap [~3 min]

> "Here's the path from where we are to a real pilot, in priority order:
>
> **Sprint 1 — close the security and correctness gaps.** The prompt-injection fix, the BKT
> invariant guard, the session-recovery fix, and the compiler cleanup. These are all scoped from
> this morning's audits — no discovery work left, just implementation.
>
> **Sprint 2 — wire up real persistence.** Connect the existing Prisma schema to a live Postgres
> instance, plug in the Redis session cache that's already built, and add the database-level
> concurrency guard our audits flagged as the one thing standing between 'works in a demo' and
> 'works with real concurrent students.'
>
> **Sprint 3 — auth and multi-tenancy.** Real account creation, login, and the single-active-session
> enforcement that's already designed but not yet wired into the flow.
>
> After that, we're in pilot territory — a small group of real students, real accounts, real
> persistence, with the security and correctness issues we found today already closed before
> anyone outside this room touches it."

---

## 8. Close [~1-2 min]

> "To bring it back to the one sentence I opened with: we're not building a chatbot with a tutoring
> prompt. We're building a system that maintains an actual structured model of how each student
> thinks, updates it deliberately rather than accidentally, and — as of this morning — has been
> through the kind of rigorous, self-initiated audit process I'd want in place before this ever
> touches a real kid's education.
>
> [**Customize this paragraph to your actual ask** — e.g.: "What I need from you is sign-off to
> provision a real staging database and move into Sprint 1 this week," or "I wanted this to be a
> status update — no ask today, just wanted you to see where the engineering rigor stands," or
> "I'd like to talk about timeline and whether we bring in additional engineering support to
> compress these three sprints."]
>
> Happy to open it up to questions, or go deeper into any piece of the architecture."

---

## Anticipated questions (prep, not to read aloud)

**"Is this secure enough to use with kids today?"**
No — and say so plainly. The prompt-injection finding from this morning is real and unpatched as of
right now. It's scoped and fast to fix (Sprint 1), but it should be fixed before any real student
touches this.

**"Why isn't the database connected yet — isn't that the whole point?"**
The algorithms (BKT/FSRS/DSR) and the prompt pipeline were the highest-uncertainty, highest-risk
part of the system to validate — "does the tutoring logic actually work" is a harder question than
"can we wire up Prisma," which is comparatively mechanical. We proved the hard part first.

**"How do you know the audits themselves are trustworthy?"**
Each one independently re-derived its findings from the actual source files rather than trusting
the prompt's description of the system — several of them explicitly caught and corrected mismatches
between an older design document and what's actually implemented. That's a stronger signal than a
single pass of code review.

**"What's the cost profile of this at scale?"**
Because of Law #2 — bounded context per session — per-session cost to the model provider stays flat
regardless of how long a student has used the product, unlike transcript-replay approaches where
cost grows with tenure. Exact unit economics depend on session length and model choice, which is
worth a follow-up if useful.

**"What's the realistic timeline to a pilot?"**
Three focused sprints as scoped above — give a real date only if you're confident in team bandwidth;
otherwise say "I'd rather commit to a number after Sprint 1 is actually in flight" — that's a
defensible answer to a CEO, not a dodge.

---

*Reference material available if requested: `AUDIT_EXPORT_2026-07-13.md` (full findings from all
8 audits) and `DATABASE_API_HOOKS.md` (complete inventory of what's wired vs. scaffolded), both in
this repository.*
