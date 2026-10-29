import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape } from "./base";
import { criterion } from "../helpers";
import { PropertyBriefSchema, type Fact } from "@/lib/domain/schemas";
import { checkImageCaption, checkText, indexBrief } from "@/lib/builder/factcheck";
import { formatArea, formatPrice } from "@/lib/format";

const Input = z.object({ brief: PropertyBriefSchema });
const FactSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  status: z.enum(["verified", "user_provided", "assumption", "missing"]),
  source: z.string(),
});
const Output = z.object({
  ...baseOutputShape,
  facts: z.array(FactSchema),
  claimsRequiringVerification: z.array(z.object({ claim: z.string(), source: z.string(), reason: z.string() })),
  riskyLanguage: z.array(z.object({ text: z.string(), issue: z.string(), severity: z.enum(["info", "warning", "critical"]) })),
  imageFlags: z.array(z.object({ imageId: z.string(), issue: z.string() })),
});
export type FactsOutput = z.infer<typeof Output>;

export function buildFactLedger(brief: z.infer<typeof PropertyBriefSchema>): Fact[] {
  const facts: Fact[] = [
    { id: "f_name", label: "Property name", value: brief.name, status: "verified", source: "Brief · structured field" },
    { id: "f_location", label: "Location", value: `${brief.neighborhood}, ${brief.city}, ${brief.country}`, status: "verified", source: "Brief · structured field" },
    { id: "f_price", label: "Asking price", value: formatPrice(brief.price.amount, brief.price.currency), status: "verified", source: "Brief · structured field" },
    { id: "f_bedrooms", label: "Bedrooms", value: String(brief.bedrooms), status: "verified", source: "Brief · structured field" },
    { id: "f_bathrooms", label: "Bathrooms", value: String(brief.bathrooms), status: "verified", source: "Brief · structured field" },
    { id: "f_interior", label: "Interior area", value: formatArea(brief.interiorArea, brief.areaUnit), status: "verified", source: "Brief · structured field" },
  ];
  const optional: [string, string, number | null, (n: number) => string][] = [
    ["f_land", "Land area", brief.landArea, (n) => formatArea(n, brief.areaUnit)],
    ["f_year", "Year built", brief.yearBuilt, String],
    ["f_parking", "Parking spaces", brief.parkingSpaces, String],
    ["f_fees", "Maintenance fees", brief.maintenanceFee, (n) => formatPrice(n, brief.price.currency) + " / month"],
  ];
  for (const [id, label, v, fmt] of optional) {
    facts.push(v == null ? { id, label, value: "Not supplied", status: "missing", source: "Brief" } : { id, label, value: fmt(v), status: "verified", source: "Brief · structured field" });
  }
  brief.verifiedAmenities.forEach((a, i) => facts.push({ id: `f_amenity_${i + 1}`, label: "Verified amenity", value: a, status: "verified", source: "Brief · verified amenities" }));
  brief.claimsToVerify.forEach((c, i) => facts.push({ id: `f_claim_${i + 1}`, label: "Claim to verify", value: c, status: "user_provided", source: "Brief · claims to verify" }));
  if (brief.locationNotes) facts.push({ id: "f_location_notes", label: "Location notes", value: brief.locationNotes, status: "user_provided", source: "Brief · location notes (agent-supplied)" });
  return facts;
}

export const factsAgent: AgentDefinition<z.infer<typeof Input>, FactsOutput> = {
  id: "facts",
  number: "03",
  name: "Property Facts & Compliance",
  purpose: "Maintains the source of truth for property details and flags unsupported claims, missing data and risky language for human review.",
  dependsOn: [],
  kind: "rule",
  acceptanceCriteria: [
    "Ledger contains price, bedrooms, bathrooms and interior area",
    "Every claim to verify is listed as user-provided",
    "Missing recommended details are listed",
    "Flags are framed as review items, not legal advice",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Building the fact ledger and screening the description and photos",
  buildInput: (ctx) => ({ brief: ctx.brief }),
  demo: ({ brief }) => {
    const idx = indexBrief(brief);
    const facts = buildFactLedger(brief);
    const descIssues = checkText(brief.description, idx);
    const claims = [
      ...brief.claimsToVerify.map((c) => ({ claim: c, source: "Claims to verify", reason: "Supplied by the user without documentation." })),
      ...descIssues
        .filter((i) => i.code === "unsupported_amenity" || i.code === "unverified_claim")
        .map((i) => ({ claim: i.evidence ?? "", source: "Free-text description", reason: i.message })),
    ];
    const risky = descIssues
      .filter((i) => !["unsupported_amenity", "unverified_claim"].includes(i.code))
      .map((i) => ({ text: i.evidence ?? "", issue: i.message, severity: i.severity }));
    const imageFlags = brief.images.flatMap((im) => checkImageCaption(im.caption, idx).map((i) => ({ imageId: im.id, issue: i.message })));
    const missing = facts.filter((f) => f.status === "missing");
    return {
      summary: `${facts.filter((f) => f.status === "verified").length} verified facts, ${claims.length} claims needing verification, ${missing.length} missing details, ${risky.length} language flags.`,
      rationale: "Structured fields and verified amenities form the source of truth. The free-text description and claims are treated as user-provided until documented.",
      warnings: [
        "Compliance flags are heuristic review prompts, not legal advice. Confirm with your brokerage's compliance process.",
        ...missing.map((m) => `${m.label} not supplied.`),
      ],
      assumptions: [],
      facts,
      claimsRequiringVerification: claims,
      riskyLanguage: risky,
      imageFlags,
    };
  },
  instructions: "Deterministic agent — no model call. The fact ledger must not be generated by a language model.",
  accept: (o, { brief }) => [
    criterion("Ledger contains price, bedrooms, bathrooms and interior area", ["f_price", "f_bedrooms", "f_bathrooms", "f_interior"].every((id) => o.facts.some((f) => f.id === id))),
    criterion("Every claim to verify is listed as user-provided", brief.claimsToVerify.every((c) => o.facts.some((f) => f.value === c && f.status === "user_provided"))),
    criterion("Missing recommended details are listed", o.facts.every((f) => f.status !== "missing" || o.warnings.some((w) => w.startsWith(f.label)))),
    criterion("Flags are framed as review items, not legal advice", o.warnings.some((w) => /not legal advice/i.test(w))),
  ],
  proposals: () => [],
  summarize: (o) => o.summary,
};
