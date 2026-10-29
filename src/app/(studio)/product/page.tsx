import type { Metadata } from "next";
import { AGENTS, AGENT_ORDER } from "@/lib/agents/registry";
import { Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Product brief" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="font-display mt-12 border-t border-line pt-8 text-3xl text-ink">{children}</h2>;
const L = ({ items }: { items: React.ReactNode[] }) => <ul className="mt-3 space-y-2 text-[0.95rem] leading-relaxed text-charcoal">{items.map((x, i) => <li key={i} className="flex gap-3"><span className="text-taupe">—</span><span>{x}</span></li>)}</ul>;

export default function ProductBrief() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <SectionHeading eyebrow="Product case study" title="PresenceOS — product brief">
        A prototype exploring how AI agents can produce luxury real-estate marketing that is fast, on-brand and factually safe. Independent prototype; not affiliated with any brokerage or real-estate platform.
      </SectionHeading>

      <H>Primary users</H>
      <L items={[
        <><strong>Luxury listing agents</strong> who need a premium launch campaign (page, listing copy, social, reel) for each new listing without an agency timeline.</>,
        <><strong>Brokerage marketing and creative teams</strong> who produce many campaigns and own brand consistency and compliance.</>,
      ]} />

      <H>Problem and job to be done</H>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-charcoal">
        “When I win a listing, help me launch a campaign worthy of the property within a day — without inventing facts, breaking our brand, or creating compliance risk.” Generic AI writing tools are fast but untrustworthy: they hallucinate amenities, drift off-brand and leave no audit trail. Agencies are trustworthy but slow and costly.
      </p>

      <H>Value proposition</H>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-charcoal">An orchestrated creative workflow, not a text generator: specialists collaborate, disagreements are surfaced rather than hidden, facts are protected by deterministic checks, and nothing goes live without human approval — with every change traceable.</p>

      <H>MVP scope (this prototype)</H>
      <L items={[
        "Structured intake separating verified facts, user claims and missing information.",
        "Twelve typed specialist agents plus a Builder that schedules them as a dependency graph, validates schemas and acceptance criteria, retries malformed output and detects conflicts.",
        "Review queue: approve, edit, reject; conflict resolution with trade-offs and a recommendation; bulk-approve only validation-passed recommendations.",
        "Apply creates immutable versions; changelog; compare and non-destructive restore.",
        "Deterministic QA and regression checks; critical issues block campaign approval.",
        "Feedback iterations that rerun only affected agents and build on the approved version.",
        "Editorial public property page; event instrumentation and a metrics dashboard.",
      ]} />

      <H>Non-goals</H>
      <L items={["Image generation or editing.", "Live market research, MLS or listing-feed integration.", "Publishing to social networks or sending email.", "Legal or fair-housing compliance determinations — the product flags for human review.", "Multi-user accounts, roles and permissions."]} />

      <H>Key decisions and trade-offs</H>
      <L items={[
        <><strong>Proposals, not writes.</strong> Specialists cannot touch campaign state; only the Builder applies approved changes. Costs one extra click; buys auditability and safety.</>,
        <><strong>Deterministic facts and QA.</strong> The fact ledger and QA are rule-based even in model mode, so the source of truth cannot hallucinate. Heuristics miss nuance; they are framed as review prompts.</>,
        <><strong>Surface conflicts.</strong> When agents disagree, the Builder recommends but never auto-resolves. Slower than silent arbitration, but the human sees the brand-vs-SEO trade-off.</>,
        <><strong>Facts-only baseline.</strong> v1 contains no generated copy, so the live page is always human-approved content.</>,
        <><strong>Targeted iterations.</strong> Feedback reruns the affected agents and their dependents; others are reused as context. Cheaper and more stable; can miss cross-cutting feedback (falls back to a broad rerun when feedback has no clear focus).</>,
        <><strong>Local JSON persistence.</strong> Zero infrastructure for a demo; not suitable for concurrency or multiple users.</>,
      ]} />

      <H>Success metrics</H>
      <L items={["North star: campaigns approved and published per agent per month.", "Time to first draft and time to approval (instrumented).", "First-pass approval rate — proxy for output quality (instrumented).", "Unresolved critical QA issues at publish — target zero (enforced).", "Revisions per campaign and iteration count (instrumented).", "Guardrail: post-publish factual corrections (requires production data)."]} />

      <H>Risks and mitigations</H>
      <L items={[
        <>Hallucinated facts → deterministic validation of every proposal; unverified claims blocked; QA proposes corrections.</>,
        <>Over-trust in AI recommendations → conflicts and rationales visible; bulk approval limited to validation-passed items.</>,
        <>Compliance exposure → risky-language flags with “not legal advice” framing; human approval gate.</>,
        <>Heuristic checks miss issues or over-flag → transparent evidence per issue; editable outcomes; expand rules from production feedback.</>,
        <>Model cost and latency → parallel scheduling, targeted reruns, medium effort; demo mode for development.</>,
      ]} />

      <H>Known limitations</H>
      <L items={[
        "Demo mode agents are deterministic templates — they demonstrate the orchestration, not creative quality.",
        "Model mode is implemented but was not exercised in this environment (no API key).",
        "Fact checks are English-language heuristics; Spanish output requires model mode and is not validated as thoroughly.",
        "Photos are judged by caption only; no computer vision.",
        "Single-user, local persistence; no auth.",
      ]} />

      <H>Roadmap</H>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          ["MVP (built)", ["Orchestrated 12-agent pipeline", "Review, apply, versioning", "QA gate & regression", "Targeted iterations", "Local analytics"]],
          ["Next", ["Real model runs evaluated against a golden set of briefs", "Document upload to verify claims (floor plans, permits)", "Postgres + auth, roles (agent / marketing / compliance)", "Spanish fact checks", "Listing-page event tracking for the experiments Agent 12 proposes"]],
          ["Future", ["Brokerage brand kits shared across campaigns", "Vision model for photo QA and selection", "Publishing integrations (portals, social, email)", "Learning from approval/rejection history", "Comparable-listing research with cited sources"]],
        ].map(([t, items]) => (
          <Card key={t as string} className="p-4">
            <p className="font-display text-xl">{t as string}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-charcoal">{(items as string[]).map((i) => <li key={i}>— {i}</li>)}</ul>
          </Card>
        ))}
      </div>

      <H>Agent roster</H>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {AGENT_ORDER.map((id) => (
          <Card key={id} className="p-4">
            <p className="eyebrow text-taupe">Agent {AGENTS[id].number} · {AGENTS[id].kind === "rule" ? "rule-based" : "LLM in model mode"}</p>
            <p className="mt-1 font-medium text-ink">{AGENTS[id].name}</p>
            <p className="mt-1 text-sm text-stone">{AGENTS[id].purpose}</p>
            <p className="mt-2 text-xs text-stone">Depends on: {AGENTS[id].dependsOn.length ? AGENTS[id].dependsOn.map((d) => AGENTS[d].number).join(", ") : "—"}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
