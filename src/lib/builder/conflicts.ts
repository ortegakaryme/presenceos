import type { AgentId, Author, Conflict, Proposal } from "@/lib/domain/schemas";
import { FIELDS, isFieldPath, valuesEqual } from "@/lib/domain/fields";
import { newId } from "@/lib/ids";

/** Which specialist has the final say on a field when proposals are otherwise equally valid. */
export const FIELD_AUTHORITY: Partial<Record<string, AgentId>> = {
  "landing.heroHeadline": "copy",
  "landing.ctaLabel": "brand",
  "landing.sectionOrder": "ux",
  "landing.heroImageId": "visual",
  "landing.galleryImageIds": "visual",
  "seo.metaTitle": "seo",
  "seo.metaDescription": "seo",
};

export const AGENT_LABEL: Record<Author, string> = {
  audience: "Audience Research",
  market: "Market & Competitor Research",
  facts: "Property Facts & Compliance",
  brand: "Brand Strategist",
  positioning: "Positioning & Narrative",
  copy: "Copywriting",
  visual: "Visual Creative Director",
  social: "Social & Video",
  ux: "Landing Page UX",
  seo: "Conversion & SEO",
  qa: "Creative QA",
  analytics: "Analytics & Experimentation",
  human: "You (editor)",
  builder: "Builder",
};

const RANK = { passed: 0, warning: 1, blocked: 2 } as const;

function tradeoffFor(field: string, ps: Proposal[]): string {
  const agents = new Set(ps.map((p) => p.agentId));
  if (field === "landing.heroHeadline" && agents.has("copy") && agents.has("seo")) {
    return "The editorial headline (Copywriting) keeps the hero distinctive and on-brand; the keyword-led headline (Conversion & SEO) states location, bedrooms and type for search and portal visitors. The keyword phrase can also live in the meta title, which Conversion & SEO proposes separately.";
  }
  if (field === "landing.ctaLabel" && agents.has("brand") && agents.has("seo")) {
    return "The Brand Strategist's CTA is calm and appointment-based. Conversion & SEO adds a time cue that may lift clicks, but it reads as urgency, which the brand guardrails discourage.";
  }
  if (field === "landing.sectionOrder") {
    return "Facts-first (Landing Page UX) helps buyers qualify on price and size quickly; gallery-first (Visual Creative Director) lets photography set the tone before any text. Analytics proposes testing both once there is traffic.";
  }
  if (ps.some((p) => p.correctsProposalId)) {
    return "The original draft is blocked by a critical validation issue. Creative QA's correction removes only the flagged sentences and leaves the rest unchanged.";
  }
  return ps.map((p) => `${AGENT_LABEL[p.agentId]}: ${p.rationale}`).join(" — versus — ");
}

/**
 * Groups pending proposals by field and opens a conflict wherever agents disagree.
 * The Builder recommends an option but never resolves a conflict on its own.
 */
export function detectConflicts(runId: string, proposals: Proposal[]): Conflict[] {
  const byField = new Map<string, Proposal[]>();
  for (const p of proposals) {
    if (p.status !== "pending") continue;
    byField.set(p.field, [...(byField.get(p.field) ?? []), p]);
  }
  const conflicts: Conflict[] = [];
  for (const [field, ps] of byField) {
    const distinct = ps.filter((p, i) => ps.findIndex((q) => valuesEqual(q.proposedValue, p.proposedValue)) === i);
    if (distinct.length < 2) continue;
    const best = Math.min(...distinct.map((p) => RANK[p.validation.status]));
    const eligible = distinct.filter((p) => RANK[p.validation.status] === best);
    const authority = FIELD_AUTHORITY[field];
    const correction = eligible.find((p) => p.correctsProposalId);
    const pick = correction ?? eligible.find((p) => p.agentId === authority) ?? eligible[0];
    const reasons: string[] = [];
    if (best === 0 && distinct.some((p) => p.validation.status !== "passed")) reasons.push("it passes validation while the alternative has open issues");
    if (correction) reasons.push("it corrects a blocked draft");
    if (pick.agentId === authority) reasons.push(`${AGENT_LABEL[pick.agentId]} owns ${isFieldPath(field) ? FIELDS[field].label.toLowerCase() : field} decisions`);
    if (!reasons.length) reasons.push("it is the first valid option; no stronger signal distinguishes them");
    const conflict: Conflict = {
      id: newId("cfl"),
      runId,
      field,
      proposalIds: ps.map((p) => p.id),
      tradeoff: tradeoffFor(field, distinct),
      recommendation: { proposalId: pick.id, reason: `Recommended because ${reasons.join(", and ")}.` },
      status: "open",
    };
    for (const p of ps) p.conflictId = conflict.id;
    conflicts.push(conflict);
  }
  return conflicts;
}
