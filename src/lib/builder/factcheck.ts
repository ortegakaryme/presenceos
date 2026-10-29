import type { IssueSeverity, PropertyBrief, ValidationIssue } from "@/lib/domain/schemas";

/**
 * Deterministic fact, claim and language checks.
 *
 * These are heuristics, not legal review: they surface risky language for a human to
 * assess. They are used by the Builder when validating proposals and by QA when
 * checking the current campaign version.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function parseNum(token: string): number | null {
  const t = token.toLowerCase().replace(/,/g, "");
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t];
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;

/** Amenity vocabulary: if copy mentions one of these, it must be backed by a verified fact. */
const AMENITY_LEXICON: { term: string; pattern: RegExp; keys: string[] }[] = [
  { term: "pool", pattern: /\b(swimming\s+)?pool\b/i, keys: ["pool"] },
  { term: "gym", pattern: /\b(gym|fitness (room|centre|center))\b/i, keys: ["gym", "fitness"] },
  { term: "spa / sauna", pattern: /\b(spa|sauna|steam room|hammam)\b/i, keys: ["spa", "sauna", "steam"] },
  { term: "elevator", pattern: /\b(elevator|lift)\b/i, keys: ["elevator", "lift"] },
  { term: "cinema", pattern: /\b(cinema|home theat(er|re)|screening room)\b/i, keys: ["cinema", "theater", "theatre", "screening"] },
  { term: "rooftop", pattern: /\broof ?top\b/i, keys: ["rooftop", "roof top", "roof terrace"] },
  { term: "wine room", pattern: /\bwine (room|cellar)\b/i, keys: ["wine"] },
  { term: "tennis", pattern: /\b(tennis|padel)\b/i, keys: ["tennis", "padel"] },
  { term: "helipad", pattern: /\bhelipad\b/i, keys: ["helipad"] },
  { term: "smart home", pattern: /\bsmart[- ]home\b/i, keys: ["smart"] },
  { term: "concierge", pattern: /\b(concierge|doorman)\b/i, keys: ["concierge", "doorman"] },
  { term: "guest house", pattern: /\bguest ?house\b/i, keys: ["guest house", "guesthouse"] },
  { term: "fireplace", pattern: /\bfireplaces?\b/i, keys: ["fireplace"] },
  { term: "views", pattern: /\b(views? (of|over|across|toward|towards)|overlooking|panoramic)\b/i, keys: ["view", "overlook", "panoram"] },
  { term: "forest", pattern: /\bforest\b/i, keys: ["forest"] },
  { term: "ocean / sea", pattern: /\b(ocean|sea|beach)(front| view)?\b/i, keys: ["ocean", "sea", "beach"] },
  { term: "security", pattern: /\b(24[- ]hour security|security guard|armou?red|safe room|panic room)\b/i, keys: ["security", "safe room", "panic"] },
  { term: "solar", pattern: /\bsolar\b/i, keys: ["solar"] },
  { term: "staff quarters", pattern: /\bstaff (quarters|apartment)\b/i, keys: ["staff"] },
];

interface LanguageRule {
  pattern: RegExp;
  severity: IssueSeverity;
  code: string;
  message: string;
}

/** Unsupported superlatives, financial promises and potentially exclusionary language. */
const LANGUAGE_RULES: LanguageRule[] = [
  { pattern: /\b(guaranteed?|assured) (return|appreciation|value|roi|income)s?\b/i, severity: "critical", code: "financial_promise", message: "Promises a financial outcome. Remove; marketing copy must not guarantee returns." },
  { pattern: /\b(investment|roi|appreciat\w+|yield)\b/i, severity: "warning", code: "financial_language", message: "Investment or appreciation language needs substantiation and compliance review." },
  { pattern: /\b(most exclusive|the (best|finest)|best[- ]in[- ]class|unparall?eled|unrivall?ed|unmatched|one[- ]of[- ]a[- ]kind|the only|#1|number one|world[- ]class)\b/i, severity: "warning", code: "unsupported_superlative", message: "Unsupported superlative or exclusivity claim." },
  { pattern: /\bbest (restaurants?|schools?|neighbou?rhoods?|location)\b/i, severity: "warning", code: "subjective_claim", message: "Subjective claim about the surrounding area; not supported by supplied facts." },
  { pattern: /\baward[- ]winning\b|\bcertified\b|\bLEED\b/i, severity: "critical", code: "unverified_credential", message: "Awards or certifications must be documented before publishing." },
  { pattern: /\b(perfect|ideal|great) for (families|children|kids|couples|singles|young professionals|retirees|bachelors?)\b/i, severity: "warning", code: "exclusionary_language", message: "Describes who the home is 'for' by household type — potentially exclusionary. Describe the space, not the buyer." },
  { pattern: /\b(adults only|no children|christian|exclusive community|safe(st)? neighbou?rhood|low crime|crime[- ]free)\b/i, severity: "warning", code: "exclusionary_language", message: "Potentially exclusionary or unverifiable safety language; flag for compliance review." },
  { pattern: /\b(won'?t last|act (now|fast)|hurry|limited time|today only|once in a lifetime)\b/i, severity: "warning", code: "urgency", message: "Urgency language conflicts with the quiet-luxury voice." },
];

export interface BriefFactIndex {
  verifiedText: string;
  claimsText: string;
  brief: PropertyBrief;
}

export function indexBrief(brief: PropertyBrief): BriefFactIndex {
  const verifiedText = [
    ...brief.verifiedAmenities,
    brief.locationNotes,
    brief.neighborhood,
    brief.city,
    brief.country,
  ]
    .join(" \n ")
    .toLowerCase();
  return { verifiedText, claimsText: brief.claimsToVerify.join(" \n ").toLowerCase(), brief };
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index - 1) + 1, 0);
  const endDot = text.indexOf(".", index);
  const end = endDot === -1 ? text.length : endDot + 1;
  return text.slice(start, end).trim();
}

function numericChecks(text: string, idx: BriefFactIndex): ValidationIssue[] {
  const { brief } = idx;
  const issues: ValidationIssue[] = [];
  const checks: { re: RegExp; expected: number | null; label: string }[] = [
    { re: new RegExp(`${NUM}[- ]bed(room)?s?\\b`, "gi"), expected: brief.bedrooms, label: "bedrooms" },
    { re: new RegExp(`${NUM}(?:\\.5)?[- ](?:and a half )?bath(room)?s?\\b`, "gi"), expected: brief.bathrooms, label: "bathrooms" },
    { re: new RegExp(`${NUM}[- ](?:car|vehicle)s?\\b`, "gi"), expected: brief.parkingSpaces, label: "parking spaces" },
    { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:m²|m2|sq\.? ?m|square met(?:er|re)s)/gi, expected: null, label: "area" },
    { re: /(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.? ?ft|square feet)/gi, expected: null, label: "area" },
  ];
  const areaValues = [brief.interiorArea, brief.landArea].filter((n): n is number => n != null);
  for (const { re, expected, label } of checks) {
    for (const m of text.matchAll(re)) {
      const n = parseNum(m[1]);
      if (n == null) continue;
      if (label === "area") {
        if (!areaValues.some((a) => Math.abs(a - n) < 0.5)) {
          issues.push({ code: "factual_mismatch", severity: "critical", message: `States an area of ${m[0].trim()}, which does not match the brief (${areaValues.join(" / ")}).`, evidence: sentenceAround(text, m.index ?? 0) });
        }
        continue;
      }
      if (label === "bathrooms") {
        const full = Number.isInteger(n) && /\.5|and a half/.test(m[0]) ? n + 0.5 : n;
        if (full !== brief.bathrooms && Math.floor(brief.bathrooms) !== full) {
          issues.push({ code: "factual_mismatch", severity: "critical", message: `States ${m[0].trim()}; the brief lists ${brief.bathrooms} bathrooms.`, evidence: sentenceAround(text, m.index ?? 0) });
        }
        continue;
      }
      if (expected == null) {
        issues.push({ code: "unsupported_fact", severity: "critical", message: `States ${m[0].trim()}, but ${label} are not documented in the brief.`, evidence: sentenceAround(text, m.index ?? 0) });
      } else if (n !== expected) {
        issues.push({ code: "factual_mismatch", severity: "critical", message: `States ${m[0].trim()}; the brief lists ${expected} ${label}.`, evidence: sentenceAround(text, m.index ?? 0) });
      }
    }
  }
  // Prices: any currency amount must equal the brief price.
  const priceRe = /(?:MXN|USD|EUR|US\$|\$|€)\s?(\d[\d,]*(?:\.\d+)?)\s*(million|m\b)?/gi;
  for (const m of text.matchAll(priceRe)) {
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2]) n *= 1_000_000;
    if (Math.abs(n - brief.price.amount) > 1) {
      issues.push({ code: "factual_mismatch", severity: "critical", message: `Mentions a price of ${m[0].trim()}; the brief price is ${brief.price.currency} ${brief.price.amount.toLocaleString("en-US")}.`, evidence: sentenceAround(text, m.index ?? 0) });
    }
  }
  // Year built.
  for (const m of text.matchAll(/\bbuilt in (\d{4})\b/gi)) {
    if (brief.yearBuilt == null || Number(m[1]) !== brief.yearBuilt) {
      issues.push({ code: "factual_mismatch", severity: "critical", message: `States "${m[0]}", which does not match the brief.`, evidence: sentenceAround(text, m.index ?? 0) });
    }
  }
  return issues;
}

function amenityChecks(text: string, idx: BriefFactIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const a of AMENITY_LEXICON) {
    const m = a.pattern.exec(text);
    if (!m) continue;
    // Check the specific term that matched ("beach"), not the whole group ("ocean / sea / beach").
    const hit = m[0].toLowerCase();
    const keys = a.keys.filter((k) => hit.includes(k));
    const relevant = keys.length ? keys : a.keys;
    const verified = relevant.some((k) => idx.verifiedText.includes(k));
    if (verified) continue;
    const pending = relevant.some((k) => idx.claimsText.includes(k));
    issues.push({
      code: pending ? "unverified_claim" : "unsupported_amenity",
      severity: "critical",
      message: pending
        ? `Mentions "${m[0]}" — this is a user-provided claim still awaiting verification.`
        : `Mentions "${m[0]}", which is not a verified amenity or supplied fact.`,
      evidence: sentenceAround(text, m.index),
    });
  }
  return issues;
}

/** Any reuse of a "claim to verify" (by its first words) is an unverified claim, whatever its vocabulary. */
function claimPhraseChecks(text: string, idx: BriefFactIndex): ValidationIssue[] {
  const lower = text.toLowerCase();
  const issues: ValidationIssue[] = [];
  for (const claim of idx.brief.claimsToVerify) {
    const core = claim.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase().split(/\s+/).slice(0, 4).join(" ");
    if (core.length < 8) continue;
    const at = lower.indexOf(core);
    if (at !== -1) issues.push({ code: "unverified_claim", severity: "critical", message: `Repeats a claim that is still awaiting verification: "${claim}".`, evidence: sentenceAround(text, at) });
  }
  return issues;
}

function languageChecks(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of LANGUAGE_RULES) {
    const m = rule.pattern.exec(text);
    if (m) issues.push({ code: rule.code, severity: rule.severity, message: rule.message, evidence: sentenceAround(text, m.index) });
  }
  return issues;
}

/** Words or patterns the brand guardrails forbid. Extracted from guardrail lines starting with "Avoid". */
export function bannedTermsFromGuardrails(guardrails: string[]): string[] {
  const terms: string[] = [];
  for (const g of guardrails) {
    const m = /^avoid[^:]*:\s*(.+)$/i.exec(g.trim());
    if (!m) continue;
    for (const t of m[1].split(/[,;]/)) {
      const term = t.trim().replace(/^["“']|["”'.]$/g, "").toLowerCase();
      if (term && term.length <= 30) terms.push(term);
    }
  }
  return terms;
}

function brandChecks(text: string, banned: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lower = text.toLowerCase();
  for (const term of banned) {
    if (term === "exclamation marks" ? text.includes("!") : lower.includes(term)) {
      issues.push({ code: "brand_violation", severity: "warning", message: `Uses "${term === "exclamation marks" ? "!" : term}", which the brand guardrails ask to avoid.`, evidence: term });
    }
  }
  return issues;
}

export function checkText(text: string, idx: BriefFactIndex, opts: { banned?: string[] } = {}): ValidationIssue[] {
  if (!text.trim()) return [];
  const all = [...numericChecks(text, idx), ...amenityChecks(text, idx), ...claimPhraseChecks(text, idx), ...languageChecks(text), ...brandChecks(text, opts.banned ?? [])];
  // De-duplicate identical code+evidence pairs.
  const seen = new Set<string>();
  return all.filter((i) => {
    const key = `${i.code}|${i.message}|${i.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Images whose caption depicts an amenity that is not verified. */
export function checkImageCaption(caption: string, idx: BriefFactIndex): ValidationIssue[] {
  return amenityChecks(caption, idx).map((i) => ({
    ...i,
    code: "image_unverified_amenity",
    message: `Photo appears to show an unverified amenity (${i.evidence}). Exclude it or verify the amenity first.`,
  }));
}

/** Removes sentences that triggered critical or warning issues. Used by QA to propose corrections. */
export function stripFlaggedSentences(text: string, idx: BriefFactIndex, banned: string[] = []): { text: string; removed: string[] } {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
  const kept: string[] = [];
  const removed: string[] = [];
  for (const s of sentences) {
    const issues = checkText(s, idx, { banned });
    if (issues.some((i) => i.severity !== "info")) removed.push(s.trim());
    else kept.push(s.trim());
  }
  return { text: kept.join(" ").trim(), removed };
}
