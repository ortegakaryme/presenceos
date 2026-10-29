import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { amenityNoun, criterion, emphasisedAmenities, keyFacts, orderedAmenities, pick, spaces, typeTitle } from "../helpers";
import type { AudienceOutput } from "./audience";
import type { MarketOutput } from "./market";
import { numberWord, withArticle } from "@/lib/format";

const Input = z.object({
  name: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  bedrooms: z.number(),
  interior: z.string(),
  amenities: z.array(z.string()).describe("Verified amenities, emphasised ones first"),
  primarySegment: z.string(),
  differentiators: z.array(z.string()),
  typeWord: z.string(),
  iteration: z.number(),
  concise: z.boolean(),
});
const Pillar = z.object({ title: z.string(), body: z.string(), evidence: z.array(z.string()) });
const Output = z.object({ ...baseOutputShape, statement: z.string(), uvp: z.string(), pillars: z.array(Pillar), intro: z.string() });
export type PositioningOutput = z.infer<typeof Output>;

export const positioningAgent: AgentDefinition<z.infer<typeof Input>, PositioningOutput> = {
  id: "positioning",
  number: "05",
  name: "Positioning & Narrative",
  purpose: "Develops the positioning, unique value proposition and central narrative from verified information.",
  dependsOn: ["audience", "market", "facts"],
  kind: "llm",
  acceptanceCriteria: [
    "Positioning statement is 240 characters or fewer",
    "At least two narrative pillars, each citing verified amenities",
    "Introduction names the property",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Shaping the positioning statement and narrative pillars",
  buildInput: (ctx) => {
    const a = upstream<AudienceOutput>(ctx, "audience");
    const m = upstream<MarketOutput>(ctx, "market");
    const f = keyFacts(ctx.brief);
    return {
      name: ctx.brief.name,
      neighborhood: ctx.brief.neighborhood,
      city: ctx.brief.city,
      bedrooms: ctx.brief.bedrooms,
      interior: f.interior,
      amenities: orderedAmenities(ctx.brief, ctx.feedback.emphasis),
      primarySegment: a.primarySegment,
      // Feedback emphasis outranks the market ranking.
      differentiators: [...new Set([...emphasisedAmenities(ctx.brief, ctx.feedback.emphasis), ...m.differentiators])],
      typeWord: typeTitle(ctx.brief).toLowerCase(),
      iteration: ctx.iteration,
      concise: ctx.feedback.concise,
    };
  },
  demo: (input) => {
    // Spatial slots take physical amenities only (a renovation is not a room).
    const rooms = spaces([...input.differentiators, ...input.amenities].filter((a, i, arr) => arr.indexOf(a) === i));
    const [lead, second, third] = rooms;
    const leadNoun = amenityNoun(lead);
    const pillars = [lead, second, third].filter(Boolean).map((a) => ({
      title: amenityNoun(a).replace(/^\w/, (c) => c.toUpperCase()),
      body: `${a}.`,
      evidence: [a],
    }));
    const statement = pick(
      [
        `A residence in ${input.neighborhood} where architecture, light and ${withArticle(leadNoun)} come first — for buyers who value privacy and craft over spectacle.`,
        `${input.name} pairs ${withArticle(leadNoun)} with ${withArticle(amenityNoun(second))} in ${input.neighborhood}: a private, architectural home in the heart of ${input.city}.`,
      ],
      input.iteration,
    );
    const renovation = input.amenities.find((a) => /renovat/i.test(a));
    const intro = input.concise
      ? `${input.name} is organised around its ${leadNoun}, with ${numberWord(input.bedrooms)} bedrooms across ${input.interior}.`
      : `${input.name} is organised around its ${leadNoun}. ${renovation ? `Following ${(renovation.charAt(0).toLowerCase() + renovation.slice(1)).replace(/^full\b/, "a full")}, the ${input.typeWord}` : `The ${input.typeWord}`} brings together ${withArticle(amenityNoun(second))} and ${withArticle(amenityNoun(third))}, with ${numberWord(input.bedrooms)} bedrooms across ${input.interior} of interior space.`;
    return {
      summary: `Narrative led by the ${leadNoun}, supported by ${pillars.length} pillars.`,
      rationale: `Market agent ranks the ${leadNoun} as the strongest differentiator; it also maps to the primary segment's need for privacy and outdoor space.`,
      warnings: [],
      assumptions: [],
      statement,
      uvp: `The ${leadNoun}, completed renovation and architectural volume — documented, not implied.`,
      pillars,
      intro,
    };
  },
  instructions: `You are Agent 05, Positioning and Narrative.
Write a positioning statement (max 240 characters), a unique value proposition, 2–4 narrative pillars (each citing the verified amenities it relies on in "evidence"), and a short editorial introduction that names the property.
${SHARED_RULES}`,
  accept: (o, i) => [
    criterion("Positioning statement is 240 characters or fewer", o.statement.length <= 240, `${o.statement.length} chars`),
    criterion("At least two narrative pillars, each citing verified amenities", o.pillars.length >= 2 && o.pillars.every((p) => p.evidence.some((e) => i.amenities.includes(e)))),
    criterion("Introduction names the property", o.intro.includes(i.name)),
  ],
  proposals: (o) => [
    { field: "positioning.statement", value: o.statement, rationale: o.rationale, evidence: o.pillars.flatMap((p) => p.evidence) },
    { field: "landing.intro", value: o.intro, rationale: "Editorial opening built on the lead pillar and verified size facts.", evidence: o.pillars.flatMap((p) => p.evidence).slice(0, 3) },
  ],
  summarize: (o) => o.summary,
};
