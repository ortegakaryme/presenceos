import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES } from "./base";
import { amenityNoun, criterion, keyFacts } from "../helpers";

const Input = z.object({
  place: z.string(),
  price: z.string(),
  verifiedAmenities: z.array(z.string()),
  yearBuilt: z.number().nullable(),
  researchSourcesConnected: z.boolean(),
});
const Finding = z.object({
  statement: z.string(),
  basis: z.enum(["brief", "assumption", "source"]),
  sourceUrl: z.string().describe("Empty string unless basis is 'source'."),
  confidence: z.enum(["low", "medium", "high"]),
});
const Output = z.object({
  ...baseOutputShape,
  researchMode: z.enum(["none", "connected"]),
  findings: z.array(Finding),
  differentiators: z.array(z.string()),
  positioningOpportunities: z.array(z.string()),
});
export type MarketOutput = z.infer<typeof Output>;

/** Rough distinctiveness ranking of amenity themes (category knowledge, not market data). */
const DISTINCTIVE: RegExp[] = [
  /ocean|\bsea\b|\bbay\b|lagoon|views?\b/i,
  /garden|jacaranda|landscape/i,
  /infinity|plunge|rooftop/i,
  /renovat/i,
  /double-height|clerestory|architect|pavilion/i,
  /library|office|study/i,
  /wine/i,
  /pool|jacuzzi|palapa/i,
  /solar|rainwater/i,
  /terrace/i,
  /concierge|elevator|spa|gym/i,
];

export const marketAgent: AgentDefinition<z.infer<typeof Input>, MarketOutput> = {
  id: "market",
  number: "02",
  name: "Market & Competitor Research",
  purpose: "Finds positioning opportunities and differentiation. Uses real research only when a source is connected.",
  dependsOn: [],
  kind: "llm",
  acceptanceCriteria: [
    "Every finding states its basis (brief, assumption or source)",
    "No 'source' findings unless a research source is connected",
    "Source findings include a URL",
    "At least two differentiators grounded in verified amenities",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Identifying differentiation (no live research source connected — findings are labelled assumptions)",
  buildInput: (ctx) => {
    const f = keyFacts(ctx.brief);
    return { place: f.place, price: f.price, verifiedAmenities: ctx.brief.verifiedAmenities, yearBuilt: ctx.brief.yearBuilt, researchSourcesConnected: false };
  },
  demo: (input) => {
    const ranked = [...new Set(DISTINCTIVE.map((re) => input.verifiedAmenities.find((a) => re.test(a))).filter((a): a is string => !!a))];
    // Fall back to the brief's own order if the category list finds too few.
    for (const a of input.verifiedAmenities) if (ranked.length < 2 && !ranked.includes(a)) ranked.push(a);
    const differentiators = ranked.slice(0, 4);
    const findings: MarketOutput["findings"] = [
      { statement: `Listings at ${input.price} in ${input.place} are likely to compete on size and finishes; a narrative led by the ${amenityNoun(differentiators[0] ?? "architecture")} may stand apart.`, basis: "assumption", sourceUrl: "", confidence: "low" },
      { statement: "Buyers at this price point typically expect professional photography, precise floor areas and private viewings.", basis: "assumption", sourceUrl: "", confidence: "medium" },
      { statement: `The brief documents ${input.verifiedAmenities.length} verified amenities, which can be cited without qualification.`, basis: "brief", sourceUrl: "", confidence: "high" },
    ];
    if (input.yearBuilt) findings.push({ statement: `Built in ${input.yearBuilt}; a completed renovation can be framed as character without a project.`, basis: "brief", sourceUrl: "", confidence: "high" });
    return {
      summary: `${differentiators.length} differentiators; ${findings.filter((f) => f.basis === "assumption").length} findings are unverified assumptions.`,
      rationale: "No market data or competitor listings are connected, so comparisons are framed as hypotheses. Differentiators are drawn only from verified amenities.",
      warnings: ["No research source connected — competitor and market statements are assumptions, not research."],
      assumptions: findings.filter((f) => f.basis === "assumption").map((f) => f.statement),
      researchMode: "none",
      findings,
      differentiators,
      positioningOpportunities: differentiators.slice(0, 2).map((d) => `Make the ${amenityNoun(d)} central to the story.`),
    };
  },
  instructions: `You are Agent 02, Market and Competitor Research.
No live research source is connected in this environment. You must not present any competitor, price or market fact as researched.
Every finding needs a basis: "brief" (directly supported by the supplied facts) or "assumption" (general category knowledge, to be verified). Use "source" only if researchSourcesConnected is true, with a URL.
Identify differentiators using verified amenities only.
${SHARED_RULES}`,
  accept: (o, i) => [
    criterion("Every finding states its basis (brief, assumption or source)", o.findings.length > 0 && o.findings.every((f) => !!f.basis)),
    criterion("No 'source' findings unless a research source is connected", i.researchSourcesConnected || o.findings.every((f) => f.basis !== "source")),
    criterion("Source findings include a URL", o.findings.filter((f) => f.basis === "source").every((f) => /^https?:\/\//.test(f.sourceUrl))),
    criterion("At least two differentiators grounded in verified amenities", o.differentiators.length >= 2),
  ],
  proposals: () => [],
  summarize: (o) => o.summary,
};
