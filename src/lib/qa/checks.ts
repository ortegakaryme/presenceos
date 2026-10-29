import type { CampaignContent, PropertyBrief, QACheck, QAIssue, QAReport, ValidationIssue } from "@/lib/domain/schemas";
import { CampaignContentSchema } from "@/lib/domain/schemas";
import { FIELDS, FIELD_PATHS, PUBLISHED_TEXT_FIELDS, getField, isEmptyValue, valueToText, valuesEqual, type FieldPath } from "@/lib/domain/fields";
import { bannedTermsFromGuardrails, checkImageCaption, checkText, indexBrief } from "@/lib/builder/factcheck";
import { newId, nowIso } from "@/lib/ids";

const CODE_CATEGORY: Record<string, QAIssue["category"]> = {
  factual_mismatch: "factual",
  unsupported_fact: "factual",
  unsupported_amenity: "unsupported_claim",
  unverified_claim: "unsupported_claim",
  unverified_credential: "unsupported_claim",
  image_unverified_amenity: "unsupported_claim",
  brand_violation: "brand",
  urgency: "brand",
};

const SUGGESTIONS: Record<QAIssue["category"], string> = {
  factual: "Replace with the value from the fact ledger.",
  unsupported_claim: "Remove the claim, or document it and add it to verified amenities.",
  missing_content: "Approve a proposal for this field, or write one in the Studio.",
  brand: "Rephrase within the brand guardrails.",
  compliance: "Describe the property rather than the buyer; route to compliance review if unsure.",
  link: "Correct the contact details in the brief.",
  rendering: "Restore the required section or asset.",
  length: "Shorten to the field limit.",
};

function toIssue(field: FieldPath | undefined, v: ValidationIssue): QAIssue {
  const category = CODE_CATEGORY[v.code] ?? "compliance";
  return { id: newId("qa"), category, severity: v.severity, field, message: v.message, evidence: v.evidence ?? "", suggestion: SUGGESTIONS[category] };
}

/** Fields that only matter if their channel is selected. */
function inScope(field: FieldPath, brief: PropertyBrief): boolean {
  if (field.startsWith("social.")) return brief.channels.includes(field.split(".")[1] as never);
  return true;
}

/**
 * Phase 7 — quality assurance of a campaign version. Deterministic and reproducible.
 * `previous` enables regression checks against the prior report.
 */
export function runQA(brief: PropertyBrief, content: CampaignContent, version: number, previous: QAReport | null, history?: { field: string; newValue: unknown }[]): QAReport {
  const idx = indexBrief(brief);
  const banned = bannedTermsFromGuardrails(content.brand.guardrails);
  const issues: QAIssue[] = [];

  for (const f of FIELD_PATHS) {
    if (!inScope(f, brief)) continue;
    const spec = FIELDS[f];
    const value = getField(content, f);
    if (spec.required && isEmptyValue(value)) {
      issues.push({ id: newId("qa"), category: "missing_content", severity: "critical", field: f, message: `${spec.label} is required and empty.`, evidence: `Version ${version}`, suggestion: SUGGESTIONS.missing_content });
      continue;
    }
    if (PUBLISHED_TEXT_FIELDS.includes(f)) for (const v of checkText(valueToText(value), idx, { banned })) issues.push(toIssue(f, v));
    if ("maxLength" in spec && typeof value === "string" && value.length > spec.maxLength) {
      issues.push({ id: newId("qa"), category: "length", severity: "warning", field: f, message: `${spec.label} is ${value.length} characters (limit ${spec.maxLength}).`, evidence: value.slice(0, 80), suggestion: SUGGESTIONS.length });
    }
  }

  const imageIds = [content.landing.heroImageId, ...content.landing.galleryImageIds].filter(Boolean);
  for (const id of imageIds) {
    const img = brief.images.find((i) => i.id === id);
    if (!img) {
      issues.push({ id: newId("qa"), category: "rendering", severity: "critical", field: "landing.galleryImageIds", message: `Image "${id}" no longer exists in the brief.`, evidence: id, suggestion: SUGGESTIONS.rendering });
      continue;
    }
    for (const v of checkImageCaption(img.caption, idx)) issues.push({ ...toIssue("landing.galleryImageIds", v), evidence: `${id}: ${img.caption}` });
  }
  if (content.landing.galleryImageIds.length > 0 && content.landing.galleryImageIds.length < 3) {
    issues.push({ id: newId("qa"), category: "rendering", severity: "warning", field: "landing.galleryImageIds", message: "Gallery has fewer than three photos.", evidence: `${content.landing.galleryImageIds.length} photos`, suggestion: SUGGESTIONS.rendering });
  }
  for (const req of ["facts", "gallery", "inquiry"] as const) {
    if (content.landing.sectionOrder.length && !content.landing.sectionOrder.includes(req)) {
      issues.push({ id: newId("qa"), category: "rendering", severity: "warning", field: "landing.sectionOrder", message: `Page omits the "${req}" section.`, evidence: content.landing.sectionOrder.join(" → "), suggestion: SUGGESTIONS.rendering });
    }
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brief.contactEmail);
  if (!emailOk) issues.push({ id: newId("qa"), category: "link", severity: "critical", message: "Inquiry email is not a valid address.", evidence: brief.contactEmail, suggestion: SUGGESTIONS.link });
  const phoneOk = !brief.contactPhone || /^\+?[\d\s()-]{7,}$/.test(brief.contactPhone);
  if (!phoneOk) issues.push({ id: newId("qa"), category: "link", severity: "warning", message: "Phone number format looks invalid for a tel: link.", evidence: brief.contactPhone, suggestion: SUGGESTIONS.link });
  const badUrls = brief.images.filter((i) => !/^https:\/\/\S+$/.test(i.url) && !i.url.startsWith("/api/uploads/"));
  if (badUrls.length) issues.push({ id: newId("qa"), category: "link", severity: "warning", message: `${badUrls.length} image URL(s) are not https or uploaded files.`, evidence: badUrls.map((b) => b.id).join(", "), suggestion: SUGGESTIONS.link });

  const has = (cat: QAIssue["category"][], sev?: QAIssue["severity"]) => issues.filter((i) => cat.includes(i.category) && (!sev || i.severity === sev));
  const check = (id: string, label: string, failing: QAIssue[], okDetail: string): QACheck => ({ id, label, passed: failing.length === 0, detail: failing.length ? `${failing.length} issue${failing.length > 1 ? "s" : ""}` : okDetail });

  const renderingContract = !!content.landing.heroHeadline && !!content.landing.heroImageId && content.landing.sectionOrder.includes("inquiry");
  const checks: QACheck[] = [
    check("required", "Required content present", has(["missing_content"]), "All required fields have values"),
    check("facts", "Facts consistent with the ledger", has(["factual"]), "Numbers match the brief"),
    check("claims", "No unsupported or unverified claims", has(["unsupported_claim"]), "Every amenity mention is verified"),
    check("brand", "Brand guardrails respected", has(["brand"]), "No banned terms or urgency"),
    check("compliance", "Language flagged for compliance review", has(["compliance"]), "No risky language detected"),
    check("links", "Contact links and image sources valid", has(["link"]), "mailto:, tel: and image URLs are well-formed"),
    { id: "render", label: "Page rendering contract", passed: renderingContract && has(["rendering"]).length === 0, detail: renderingContract ? (has(["rendering"]).length ? `${has(["rendering"]).length} layout issues` : "Hero, headline and inquiry section present") : "Missing hero headline, hero image or inquiry section" },
    check("lengths", "Metadata and headline within limits", has(["length"]), "All fields within limits"),
  ];

  const regression: QACheck[] = [];
  const schemaOk = CampaignContentSchema.safeParse(content).success;
  regression.push({ id: "schema", label: "Version content matches the campaign schema", passed: schemaOk, detail: schemaOk ? "Valid" : "Schema validation failed" });
  if (history) {
    const lastByField = new Map<string, unknown>();
    for (const h of history) lastByField.set(h.field, h.newValue);
    const drift = [...lastByField].filter(([f, v]) => !valuesEqual(getField(content, f), v as never));
    regression.push({ id: "persisted", label: "Every applied change is present in this version", passed: drift.length === 0, detail: drift.length ? `Drift in: ${drift.map(([f]) => f).join(", ")}` : `${lastByField.size} fields verified` });
  }
  if (previous) {
    const newlyFailing = checks.filter((c) => !c.passed && previous.checks.find((p) => p.id === c.id)?.passed);
    regression.push({ id: "no_regressions", label: "No previously passing check now fails", passed: newlyFailing.length === 0, detail: newlyFailing.length ? newlyFailing.map((c) => c.label).join("; ") : `Compared with v${previous.version}` });
    const prevCrit = previous.issues.filter((i) => i.severity === "critical").length;
    const crit = issues.filter((i) => i.severity === "critical").length;
    regression.push({ id: "critical_trend", label: "Critical issues did not increase", passed: crit <= prevCrit, detail: `${prevCrit} → ${crit}` });
  }

  return { ranAt: nowIso(), version, issues, checks, regression };
}
