# PresenceOS — Product Brief

*Prototype case study: AI-powered creative tooling for luxury real-estate marketing.*

## Primary users
- **Luxury listing agents** who need a premium launch campaign for each new listing without an agency timeline.
- **Brokerage marketing and creative teams** who produce many campaigns and own brand consistency and compliance.

## Problem and job to be done
> "When I win a listing, help me launch a campaign worthy of the property within a day — without inventing
> facts, breaking our brand, or creating compliance risk."

Generic AI writing tools are fast but untrustworthy: they hallucinate amenities, drift off-brand and leave no
audit trail. Agencies are trustworthy but slow and expensive.

## Value proposition
An orchestrated creative workflow, not a text generator. Specialists collaborate, disagreements are surfaced
instead of hidden, deterministic checks protect facts, nothing goes live without human approval, and every
change is traceable.

## MVP scope
- Structured intake separating verified facts, user claims and missing information.
- Twelve typed specialist agents and a Builder that schedules them as a dependency graph, validates schemas
  and acceptance criteria, retries malformed output and detects conflicts.
- Review queue: approve / edit / reject, conflicts with trade-offs and recommendations, safe bulk approval.
- Apply → immutable versions, changelog, compare and non-destructive restore.
- Deterministic QA and regression checks; critical issues block approval.
- Feedback iterations that rerun only affected agents.
- Editorial public property page; event instrumentation and a metrics dashboard.

## Non-goals
Image generation or editing · live market research or MLS feeds · publishing to social or email ·
legal / fair-housing determinations (the product flags for human review) · multi-user accounts.

## Key decisions and trade-offs
| Decision | Benefit | Cost |
|---|---|---|
| Specialists propose; only the Builder applies approved changes | Auditability, safety | One extra step (Apply) |
| Fact ledger and QA are rule-based even in model mode | Source of truth can't hallucinate; reproducible QA | Heuristics miss nuance; framed as review prompts |
| Conflicts are surfaced with a recommendation, never auto-resolved | Human sees the brand-vs-SEO trade-off | Slower than silent arbitration |
| Version 1 is a facts-only baseline | Live page is always human-approved | Page is sparse until first apply |
| Targeted reruns per feedback | Cheaper, more stable iterations | Cross-cutting feedback can need a broad rerun (fallback when feedback has no clear focus) |
| Local JSON persistence | Zero infrastructure for a demo | Not suitable for concurrency or multiple users |

## Success metrics
- **North star:** campaigns approved and published per agent per month.
- Time to first draft; time to approval (instrumented).
- First-pass approval rate — proxy for output quality (instrumented).
- Unresolved critical QA issues at publish — target zero (enforced by the approval gate).
- Revisions per campaign; iteration count (instrumented).
- Guardrail: post-publish factual corrections (needs production data).

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Hallucinated facts | Deterministic validation of every proposal; unverified claims blocked; QA proposes corrections |
| Over-trust in AI | Rationales, evidence and conflicts visible; bulk approval limited to validation-passed items |
| Compliance exposure | Risky-language flags ("not legal advice"); human approval gate |
| Heuristics miss or over-flag | Evidence per issue; editable outcomes; expand rules from production feedback |
| Model cost / latency | Parallel scheduling, targeted reruns, medium effort; demo mode for development |

## Known limitations
- Demo-mode agents are deterministic templates: they show the orchestration, not creative quality.
- Model mode is implemented but was not exercised in the build environment (no API key).
- Fact checks are English heuristics; Spanish needs model mode and gets less validation.
- Photos are assessed by caption only. Single-user local persistence, no auth.

## Roadmap
**MVP (built):** orchestrated 12-agent pipeline · review, apply, versioning · QA gate and regression ·
targeted iterations · local analytics.

**Next:** evaluate model mode against a golden set of briefs · document upload to verify claims
(floor plans, permits) · Postgres, auth and roles (agent / marketing / compliance) · Spanish fact checks ·
listing-page tracking for the experiments Agent 12 proposes.

**Future:** shared brokerage brand kits · vision model for photo QA · publishing integrations (portals,
social, email) · learning from approval and rejection history · comparable-listing research with cited sources.
