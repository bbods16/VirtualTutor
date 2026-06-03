1. 
	Dataset algebraerrors-003 (Variable Confusion) establishes a hard prerequisite gate — mastery of variable as co-varying quantity
	must be at 0.75 before slope-intercept instruction begins. This needs to be in the mastery matrix schema as a gating rule, 
	not just a soft recommendation. Worth noting for C2.
2.
	Dataset 009 reframes the entire purpose of the mastery matrix in a way that has architectural 
	implications. The mastery score is an intermediate metric — the metacognitive regulation profile is the real long-term outcome. 
	When C2 builds the Profile Service, the schema needs a dedicated metacognitive regulation sub-profile separate from the mastery matrix. 
	Worth keeping that in mind as a note when we get to P1's schema review with the coding agents.
		
3. 
	Critical flag for C2 and C3 from dataset hintsystems-008:
	The 16 Knowledge Component decomposition is a direct schema addition. The mastery matrix needs KC-level tracking fields underneath each 
	concept entry — not just a single mastery score per concept but individual scores for each of the 16 KCs. This is architecturally
	significant and needs to be in the database schema before C2 writes a single line of Prisma code.
4. 
Two things C3 needs to know before writing the tutor engine:

	feedback-001 establishes that the tutor must classify student responses as procedural vs conceptual 
	before selecting timing and type — this is a required reasoning step in the system prompt, not optional
	feedback-008 introduces the stuck/avoidant feedback loop detection — the XML delta needs a feedbackLoopType
	field in motivationalUpdates and a sessionFlag field for three-consecutive-session escalation