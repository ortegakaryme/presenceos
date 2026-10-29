import { z } from "zod";
import type { AgentDefinition, ProposalDraft } from "../types";
import { baseOutputShape, upstream } from "./base";
import { criterion } from "../helpers";
import type { BrandOutput } from "./brand";
import { PropertyBriefSchema } from "@/lib/domain/schemas";
import { bannedTermsFromGuardrails, indexBrief, stripFlaggedSentences } from "@/lib/builder/factcheck";
import { FIELDS, isEmptyValue, isFieldPath, type FieldPath } from "@/lib/domain/fields";

const DraftSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  field: z.string(),
  proposedValue: z.unknown(),
  validation: z.object({
    status: z.enum(["passed", "warning", "blocked"]),
    issues: z.array(z.object({ code: z.string(), severity: z.enum(["info", "warning", "critical"]), message: z.string(), evidence: z.string().optional() })),
  }),
});
const Input = z.object({
  brief: PropertyBriefSchema,
  drafts: z.array(DraftSchema),
  currentEmptyRequired: z.array(z.string()),
  banned: z.array(z.string()),
});
const Issue = z.object({
  proposalId: z.string(),
  field: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  category: z.enum(["factual", "unsupported_claim", "brand", "compliance", "missing_content", "length", "creative"]),
  message: z.string(),
  evidence: z.string(),
  suggestion: z.string(),
});
const Output = z.object({
  ...baseOutputShape,
  issues: z.array(Issue),
  corrections: z.array(z.object({ proposalId: z.string(), field: z.string(), agentId: z.string(), value: z.string(), removed: z.array(z.string()) })),
  scorecard: z.object({ factual: z.enum(["pass", "fail"]), brand: z.enum(["pass", "review"]), completeness: z.enum(["pass", "gaps"]) }),
});
export type QaOutput = z.infer<typeof Output>;

const CATEGORY: Record<string, z.infer<typeof Issue>["category"]> = {
  factual_mismatch: "factual",
  unsupported_fact: "factual",
  unsupported_amenity: "unsupported_claim",
  unverified_claim: "unsupported_claim",
  image_unverified_amenity: "unsupported_claim",
  brand_violation: "brand",
  urgency: "brand",
  too_long: "length",
};

const SUGGESTION: Record<string, string> = {
  factual: "Use the figure from the fact ledger.",
  unsupported_claim: "Remove the claim, or document it and move it to verified amenities.",
  brand: "Rephrase within the brand guardrails.",
  compliance: "Describe the property rather than the buyer; route to compliance review if unsure.",
  length: "Shorten to the field limit.",
  missing_content: "Approve a proposal for this field or write one in the Studio.",
  creative: "Tighten the sentence.",
};

export const qaAgent: AgentDefinition<z.infer<typeof Input>, QaOutput> = {
  id: "qa",
  number: "11",
  name: "Creative QA",
  purpose: "Evaluates drafts for factual consistency, completeness, brand alignment, unsupported claims and creative quality.",
  dependsOn: ["facts", "brand", "positioning", "copy", "visual", "social", "ux", "seo"],
  kind: "rule",
  acceptanceCriteria: [
    "Every issue has a severity, evidence and a suggested correction",
    "Every blocked draft has at least one QA issue",
    "Corrections remove the flagged sentences only",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: (ctx) => `Reviewing ${ctx.drafted.length} drafted proposals before human review`,
  buildInput: (ctx) => {
    const brand = upstream<BrandOutput>(ctx, "brand");
    const drafts = ctx.drafted.filter((p) => p.status === "pending");
    const proposedFields = new Set(drafts.map((d) => d.field));
    const currentEmptyRequired = (Object.keys(FIELDS) as FieldPath[]).filter((f) => {
      if (!FIELDS[f].required || proposedFields.has(f)) return false;
      const [g, k] = f.split(".");
      return isEmptyValue((ctx.current as unknown as Record<string, Record<string, never>>)[g][k]);
    });
    return {
      brief: ctx.brief,
      drafts: drafts.map((d) => ({ id: d.id, agentId: d.agentId, field: d.field, proposedValue: d.proposedValue, validation: d.validation })),
      currentEmptyRequired,
      banned: bannedTermsFromGuardrails(brand.guardrails),
    };
  },
  demo: (input) => {
    const idx = indexBrief(input.brief);
    const issues: QaOutput["issues"] = [];
    const corrections: QaOutput["corrections"] = [];
    for (const d of input.drafts) {
      for (const v of d.validation.issues) {
        const category = CATEGORY[v.code] ?? (/exclusionary|financial|superlative|subjective|credential/.test(v.code) ? "compliance" : "creative");
        issues.push({ proposalId: d.id, field: d.field, severity: v.severity, category, message: v.message, evidence: v.evidence ?? "", suggestion: SUGGESTION[category] });
      }
      if (d.validation.status === "blocked" && typeof d.proposedValue === "string" && isFieldPath(d.field) && ["text", "longtext"].includes(FIELDS[d.field].kind)) {
        const fixed = stripFlaggedSentences(d.proposedValue, idx, input.banned);
        if (fixed.removed.length && fixed.text) corrections.push({ proposalId: d.id, field: d.field, agentId: d.agentId, value: fixed.text, removed: fixed.removed });
      }
      if (Array.isArray(d.proposedValue) && d.field === "landing.description") {
        const long = (d.proposedValue as string[]).find((p) => p.split(/\s+/).length > 90);
        if (long) issues.push({ proposalId: d.id, field: d.field, severity: "info", category: "creative", message: "Paragraph exceeds 90 words — dense for mobile reading.", evidence: long.slice(0, 120) + "…", suggestion: SUGGESTION.creative });
      }
    }
    for (const f of input.currentEmptyRequired) {
      issues.push({ proposalId: "", field: f, severity: "warning", category: "missing_content", message: `${FIELDS[f as FieldPath].label} is required but has no value and no proposal.`, evidence: "Current version", suggestion: SUGGESTION.missing_content });
    }
    const critical = issues.filter((i) => i.severity === "critical").length;
    return {
      summary: `${issues.length} issues (${critical} critical) across ${input.drafts.length} drafts; ${corrections.length} corrections proposed.`,
      rationale: "Re-checked every draft against the fact ledger, claim list and brand 'Avoid' terms. Where a draft is blocked, QA proposes a corrected version that removes only the flagged sentences.",
      warnings: critical ? [`${critical} critical issues must be resolved before the campaign can be approved.`] : [],
      assumptions: [],
      issues,
      corrections,
      scorecard: {
        factual: issues.some((i) => i.severity === "critical" && (i.category === "factual" || i.category === "unsupported_claim")) ? "fail" : "pass",
        brand: issues.some((i) => i.category === "brand") ? "review" : "pass",
        completeness: input.currentEmptyRequired.length ? "gaps" : "pass",
      },
    };
  },
  instructions: "Deterministic agent — no model call. QA must be reproducible.",
  accept: (o, i) => [
    criterion("Every issue has a severity, evidence and a suggested correction", o.issues.every((x) => x.severity && x.suggestion && x.evidence !== undefined)),
    criterion("Every blocked draft has at least one QA issue", i.drafts.filter((d) => d.validation.status === "blocked").every((d) => o.issues.some((x) => x.proposalId === d.id))),
    criterion("Corrections remove the flagged sentences only", o.corrections.every((c) => c.removed.length > 0 && c.value.length > 0)),
  ],
  proposals: (o) =>
    o.corrections.map(
      (c): ProposalDraft => ({
        field: c.field as FieldPath,
        value: c.value,
        rationale: `Correction of ${c.agentId}'s draft: removes ${c.removed.length} flagged sentence${c.removed.length > 1 ? "s" : ""} and keeps the rest unchanged.`,
        evidence: c.removed.map((r) => `Removed: “${r}”`),
        correctsField: { agentId: c.agentId as never, field: c.field as FieldPath },
      }),
    ),
  summarize: (o) => o.summary,
};
