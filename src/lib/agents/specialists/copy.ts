import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { amenityNoun, criterion, keyFacts, orderedAmenities, pick, signatureFeature, spaces, typeTitle } from "../helpers";
import type { BrandOutput } from "./brand";
import type { PositioningOutput } from "./positioning";
import type { FactsOutput } from "./facts";
import { FeatureSchema } from "@/lib/domain/schemas";
import { article, capitalize, numberWord, withArticle } from "@/lib/format";

const Input = z.object({
  name: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  typeTitle: z.string().describe("House, Villa, Penthouse…"),
  signature: z.object({ adj: z.string(), noun: z.string() }).describe("Signature setting from verified amenities, e.g. Ocean-View / Ocean"),
  facts: z.object({ price: z.string(), bedrooms: z.number(), bathrooms: z.number(), interior: z.string(), land: z.string().nullable(), yearBuilt: z.number().nullable(), parkingSpaces: z.number().nullable() }),
  amenities: z.array(z.string()),
  claimsToVerify: z.array(z.string()),
  locationNotes: z.string(),
  voice: z.string(),
  avoidTerms: z.array(z.string()),
  pillars: z.array(z.object({ title: z.string(), body: z.string() })),
  iteration: z.number(),
  concise: z.boolean(),
  warmer: z.boolean(),
  rejectedHeadlines: z.array(z.string()),
  avoidUnverifiedClaims: z.boolean(),
});
const Output = z.object({
  ...baseOutputShape,
  headlines: z.array(z.string()),
  heroHeadline: z.string(),
  heroSubheadline: z.string(),
  descriptionParagraphs: z.array(z.string()),
  features: z.array(FeatureSchema),
  locationCopy: z.string(),
  listingCopy: z.string(),
  includedUserClaims: z.array(z.string()).describe("User-provided claims used in the copy, if any — they will be flagged for verification."),
});
export type CopyOutput = z.infer<typeof Output>;

export const copyAgent: AgentDefinition<z.infer<typeof Input>, CopyOutput> = {
  id: "copy",
  number: "06",
  name: "Copywriting",
  purpose: "Writes headlines, subheadlines, descriptions, listing copy and campaign messaging grounded in supplied facts.",
  dependsOn: ["facts", "brand", "positioning"],
  kind: "llm",
  acceptanceCriteria: [
    "At least three headline alternatives",
    "Hero headline is 70 characters or fewer",
    "At least three feature highlights, each traceable to a verified amenity",
    "Any user-provided claim used is declared in includedUserClaims",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: (ctx) => (ctx.iteration > 1 ? `Revising copy for iteration ${ctx.iteration} using feedback` : "Drafting headlines, description, features and listing copy"),
  buildInput: (ctx) => {
    const brand = upstream<BrandOutput>(ctx, "brand");
    const pos = upstream<PositioningOutput>(ctx, "positioning");
    upstream<FactsOutput>(ctx, "facts");
    const f = keyFacts(ctx.brief);
    const blockedBefore = ctx.rejected.some((r) => r.agentId === "copy" && /verif|claim/i.test(r.note ?? ""));
    return {
      name: ctx.brief.name,
      neighborhood: ctx.brief.neighborhood,
      city: ctx.brief.city,
      typeTitle: typeTitle(ctx.brief),
      signature: signatureFeature([...ctx.brief.verifiedAmenities, ctx.brief.locationNotes]),
      facts: { price: f.price, bedrooms: ctx.brief.bedrooms, bathrooms: ctx.brief.bathrooms, interior: f.interior, land: f.land, yearBuilt: ctx.brief.yearBuilt, parkingSpaces: ctx.brief.parkingSpaces },
      amenities: orderedAmenities(ctx.brief, ctx.feedback.emphasis),
      claimsToVerify: ctx.brief.claimsToVerify,
      locationNotes: ctx.brief.locationNotes,
      voice: brand.voice,
      avoidTerms: brand.avoidTerms,
      pillars: pos.pillars.map((p) => ({ title: p.title, body: p.body })),
      iteration: ctx.iteration,
      concise: ctx.feedback.concise,
      warmer: ctx.feedback.warmer,
      rejectedHeadlines: ctx.rejected.filter((r) => r.field === "landing.heroHeadline").map((r) => String(r.value)),
      // Learns from earlier iterations: once a draft was blocked for unverified claims, stop using them.
      avoidUnverifiedClaims: ctx.iteration > 1 || blockedBefore,
    };
  },
  demo: (input) => {
    const [a1, a2, a3] = spaces(input.amenities);
    const lead = amenityNoun(a1);
    const sig = input.signature;
    const candidates = [
      `${capitalize(article(sig.adj))} ${sig.adj} ${input.typeTitle} in ${input.neighborhood}`,
      `${input.name}: Architecture, Light and ${sig.noun}`,
      `${sig.adj} Living in ${input.city}`,
      `${input.name}, ${input.neighborhood}`,
    ].map((h) => h.replace(/\s+/g, " ")).filter((h) => h.length <= 70);
    const available = candidates.filter((h) => !input.rejectedHeadlines.includes(h));
    const heroHeadline = pick(available.length ? available : candidates, input.iteration);
    const bedroomsWord = capitalize(numberWord(input.facts.bedrooms));
    const heroSubheadline = `${bedroomsWord} bedrooms, ${input.facts.interior} of interior space and ${withArticle(lead)} in ${input.neighborhood}, ${input.city}.`;

    const renovation = input.amenities.find((a) => /renovat/i.test(a));
    const paragraphs = input.concise
      ? [
          `${input.name} offers ${numberWord(input.facts.bedrooms)} bedrooms and ${input.facts.bathrooms} bathrooms across ${input.facts.interior}${input.facts.land ? `, on ${input.facts.land} of land` : ""}.`,
          `Highlights include the ${amenityNoun(a1)}, the ${amenityNoun(a2)} and the ${amenityNoun(a3)}.`,
        ]
      : [
          `${input.name} offers ${numberWord(input.facts.bedrooms)} bedrooms and ${input.facts.bathrooms} bathrooms across ${input.facts.interior} of interior space${input.facts.land ? `, set on ${input.facts.land} of land` : ""}.${input.facts.yearBuilt ? (renovation ? ` Originally completed in ${input.facts.yearBuilt}, it has since undergone a full renovation.` : ` Completed in ${input.facts.yearBuilt}.`) : ""}`,
          input.warmer
            ? `Daily life gathers around the ${amenityNoun(a1)}: mornings in the ${amenityNoun(a2)}, evenings shared in the ${amenityNoun(a3)}.`
            : `The plan is organised around the ${amenityNoun(a1)}, with the ${amenityNoun(a2)} and the ${amenityNoun(a3)} forming the principal rooms.`,
          `Further documented features include ${input.amenities.filter((a) => ![a1, a2, a3].includes(a)).slice(0, 3).map((a) => a.charAt(0).toLowerCase() + a.slice(1)).join("; ")}.`,
        ];

    const features = input.amenities.slice(0, input.concise ? 4 : 6).map((a) => {
      // "Private garden with mature jacaranda trees" → title "Private garden", body "With mature jacaranda trees."
      const rest = /\s+with\s+(.+)$/i.exec(a)?.[1];
      return { title: capitalize(amenityNoun(a)), body: rest ? `With ${rest}.` : `${a}.` };
    });
    const locationCopy = input.locationNotes ? input.locationNotes : `${input.neighborhood}, ${input.city}.`;
    const useClaim = !input.avoidUnverifiedClaims && input.claimsToVerify.length > 0;
    const claim = input.claimsToVerify[0];
    const listingCopy = [
      `${input.name} is a ${numberWord(input.facts.bedrooms)}-bedroom ${input.typeTitle.toLowerCase()} in ${input.neighborhood}, ${input.city}, offered at ${input.facts.price}.`,
      `Its ${input.facts.interior} of interior space centres on the ${amenityNoun(a1)}, complemented by the ${amenityNoun(a2)} and the ${amenityNoun(a3)}.`,
      useClaim ? `Also noted: ${claim.replace(/\s*\(.*\)$/, "").replace(/^\w/, (c) => c.toLowerCase())}.` : "",
      input.facts.parkingSpaces ? `Covered parking accommodates ${numberWord(input.facts.parkingSpaces)} cars.` : "",
      "Private viewings are available by appointment.",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      summary: `Hero: "${heroHeadline}". ${paragraphs.length} description paragraphs, ${features.length} features${useClaim ? "; 1 user-provided claim included and declared" : ""}.`,
      rationale: `Headline and structure follow the positioning pillars (${input.pillars.map((p) => p.title).join(", ")}). Every number comes from the structured brief.`,
      warnings: useClaim ? [`Listing copy includes a user-provided claim pending verification: "${claim}".`] : [],
      assumptions: [],
      headlines: available.length >= 3 ? available : candidates,
      heroHeadline,
      heroSubheadline,
      descriptionParagraphs: paragraphs,
      features,
      locationCopy,
      listingCopy,
      includedUserClaims: useClaim ? [claim] : [],
    };
  },
  instructions: `You are Agent 06, Copywriting, for a luxury real-estate studio.
Write: 3–5 headline alternatives, a hero headline (max 70 chars), a hero subheadline, 2–3 description paragraphs, 4–6 feature highlights (title + one-sentence body, each derived from one verified amenity), location copy using only the supplied location notes, and listing copy.
Follow the supplied brand voice and never use the avoid terms. If you use any item from claimsToVerify, list it in includedUserClaims. If avoidUnverifiedClaims is true, do not use them at all.
${SHARED_RULES}`,
  accept: (o, i) => [
    criterion("At least three headline alternatives", o.headlines.length >= 3, `${o.headlines.length}`),
    criterion("Hero headline is 70 characters or fewer", o.heroHeadline.length <= 70, `${o.heroHeadline.length} chars`),
    criterion("At least three feature highlights, each traceable to a verified amenity", o.features.length >= 3 && o.features.every((f) => i.amenities.some((a) => a.toLowerCase().includes(f.title.toLowerCase().split(" ")[0])))),
    criterion("Any user-provided claim used is declared in includedUserClaims", i.claimsToVerify.every((c) => !o.listingCopy.includes(c.replace(/\s*\(.*\)$/, "")) || o.includedUserClaims.includes(c))),
  ],
  proposals: (o) => {
    const ev = ["Brief · structured facts", "Brief · verified amenities"];
    return [
      { field: "landing.heroHeadline", value: o.heroHeadline, rationale: "Editorial headline built on the lead narrative pillar; keeps the hero distinctive rather than keyword-led.", evidence: ["Agent 05 · lead pillar"] },
      { field: "landing.heroSubheadline", value: o.heroSubheadline, rationale: "Puts the three facts buyers scan for first — bedrooms, size, setting — directly under the headline.", evidence: ev },
      { field: "landing.description", value: o.descriptionParagraphs, rationale: o.rationale, evidence: ev },
      { field: "landing.features", value: o.features, rationale: "Each feature maps one-to-one to a verified amenity.", evidence: ["Brief · verified amenities"] },
      { field: "landing.locationCopy", value: o.locationCopy, rationale: "Location copy restricted to the supplied location notes — no invented distances or neighbourhood claims.", evidence: ["Brief · location notes"] },
      { field: "listing.headlines", value: o.headlines, rationale: "Alternatives for listing portals and A/B testing.", evidence: ["Agent 05 · pillars"] },
      { field: "listing.copy", value: o.listingCopy, rationale: o.includedUserClaims.length ? "Includes a user-provided highlight from the brief; declared for verification." : "Listing copy limited to verified facts.", evidence: ev },
    ];
  },
  summarize: (o) => o.summary,
};
