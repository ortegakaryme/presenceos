import type { CampaignContent, FieldValue, Proposal, PropertyBrief, ValidationIssue } from "@/lib/domain/schemas";
import { FIELDS, PUBLISHED_TEXT_FIELDS, isFieldPath, valueSchemaFor, valueToText, type FieldPath } from "@/lib/domain/fields";
import { bannedTermsFromGuardrails, checkImageCaption, checkText, indexBrief, type BriefFactIndex } from "./factcheck";

export interface ValidationContext {
  brief: PropertyBrief;
  idx: BriefFactIndex;
  banned: string[];
}

export function validationContext(brief: PropertyBrief, guardrails: string[]): ValidationContext {
  return { brief, idx: indexBrief(brief), banned: bannedTermsFromGuardrails(guardrails) };
}

export type ValidationResult = { valid: boolean; status: Proposal["validation"]["status"]; issues: ValidationIssue[]; risk: Proposal["risk"] };

/** The Builder's gate for every proposed value — agent-authored or human-edited. */
export function validateValue(field: string, value: FieldValue, vc: ValidationContext): ValidationResult {
  if (!isFieldPath(field)) {
    return { valid: false, status: "blocked", issues: [{ code: "unknown_field", severity: "critical", message: `Unknown field "${field}".` }], risk: "critical" };
  }
  const parsed = valueSchemaFor(field).safeParse(value);
  if (!parsed.success) {
    return { valid: false, status: "blocked", issues: [{ code: "invalid_value", severity: "critical", message: `Value does not match the ${FIELDS[field].kind} schema: ${parsed.error.issues[0]?.message ?? "invalid"}` }], risk: "critical" };
  }
  const spec = FIELDS[field];
  const issues: ValidationIssue[] = [];

  if (PUBLISHED_TEXT_FIELDS.includes(field)) issues.push(...checkText(valueToText(value), vc.idx, { banned: vc.banned }));
  if (field === "brand.voice") issues.push(...checkText(String(value), vc.idx).filter((i) => i.severity === "critical"));

  if ("maxLength" in spec && typeof value === "string" && value.length > spec.maxLength) {
    issues.push({ code: "too_long", severity: "warning", message: `${value.length} characters — limit is ${spec.maxLength}.` });
  }
  if (field === "landing.ctaLabel" && /\b(today|now|hurry|fast|last chance)\b/i.test(String(value))) {
    issues.push({ code: "urgency", severity: "warning", message: "CTA uses a time or urgency cue; brand guardrails ask for no urgency tactics.", evidence: String(value) });
  }
  if (spec.kind === "image" || spec.kind === "images") {
    const ids = Array.isArray(value) ? (value as string[]) : [value as string];
    for (const id of ids) {
      const img = vc.brief.images.find((i) => i.id === id);
      if (!img) issues.push({ code: "unknown_image", severity: "critical", message: `Image "${id}" is not one of the supplied photos.` });
      else issues.push(...checkImageCaption(img.caption, vc.idx).map((i) => ({ ...i, evidence: `${id}: ${img.caption}` })));
    }
  }
  if (spec.kind === "sections") {
    const s = value as string[];
    for (const req of ["facts", "gallery", "inquiry"]) {
      if (!s.includes(req)) issues.push({ code: "missing_section", severity: "warning", message: `Section order omits "${req}".` });
    }
    if (new Set(s).size !== s.length) issues.push({ code: "duplicate_section", severity: "warning", message: "Section order contains duplicates." });
  }

  const status = issues.some((i) => i.severity === "critical") ? "blocked" : issues.some((i) => i.severity === "warning") ? "warning" : "passed";
  const factual = (["landing", "listing", "social", "video", "seo"] as const).some((g) => field.startsWith(g));
  const risk: Proposal["risk"] = status === "blocked" ? "critical" : status === "warning" ? (factual ? "high" : "medium") : factual ? "low" : "low";
  return { valid: true, status, issues, risk };
}

export function contentGuardrails(content: CampaignContent): string[] {
  return content.brand.guardrails;
}

export type { FieldPath };
