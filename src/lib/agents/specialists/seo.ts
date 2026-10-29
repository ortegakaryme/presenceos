import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { amenityNoun, criterion, keyFacts, signatureFeature, spaces, typeTitle } from "../helpers";
import type { CopyOutput } from "./copy";
import type { UxOutput } from "./ux";
import type { BrandOutput } from "./brand";
import { capitalize, numberWord, slugify, truncate, withArticle } from "@/lib/format";

const Input = z.object({
  name: z.string(),
  neighborhood: z.string(),
  city: z.string(),
  bedrooms: z.number(),
  interior: z.string(),
  land: z.string().nullable(),
  leadAmenity: z.string(),
  typeTitle: z.string(),
  signatureAdj: z.string(),
  editorialHeadline: z.string(),
  brandCta: z.string(),
  agentName: z.string(),
  brokerage: z.string(),
  seoFocus: z.boolean(),
  proposeHeadline: z.boolean(),
  proposeCta: z.boolean(),
});
const Output = z.object({
  ...baseOutputShape,
  heroHeadline: z.string().describe("Keyword-led alternative; empty string if not proposing one"),
  ctaLabel: z.string().describe("Conversion-optimised CTA; empty string if not proposing one"),
  ctaSupport: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  keywords: z.array(z.string()),
  conversionNotes: z.array(z.string()),
});
export type SeoOutput = z.infer<typeof Output>;

export const seoAgent: AgentDefinition<z.infer<typeof Input>, SeoOutput> = {
  id: "seo",
  number: "10",
  name: "Conversion & SEO",
  purpose: "Recommends calls to action, page metadata, search-friendly content and conversion-journey improvements.",
  dependsOn: ["copy", "ux", "brand"],
  kind: "llm",
  acceptanceCriteria: [
    "Meta title is 60 characters or fewer",
    "Meta description is 160 characters or fewer",
    "Slug is lowercase kebab-case",
    "At least three target keywords",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: (ctx) => (ctx.feedback.seoFocus ? "Strengthening search metadata per feedback" : "Writing metadata, CTA and conversion recommendations"),
  buildInput: (ctx) => {
    const copy = upstream<CopyOutput>(ctx, "copy");
    upstream<UxOutput>(ctx, "ux");
    const brand = upstream<BrandOutput>(ctx, "brand");
    const f = keyFacts(ctx.brief);
    const focus = ctx.feedback.focus;
    return {
      name: ctx.brief.name,
      neighborhood: ctx.brief.neighborhood,
      city: ctx.brief.city,
      bedrooms: ctx.brief.bedrooms,
      interior: f.interior,
      land: f.land,
      leadAmenity: amenityNoun(spaces(ctx.brief.verifiedAmenities)[0] ?? copy.features[0]?.title ?? ""),
      typeTitle: typeTitle(ctx.brief),
      signatureAdj: signatureFeature([...ctx.brief.verifiedAmenities, ctx.brief.locationNotes]).adj,
      editorialHeadline: copy.heroHeadline,
      brandCta: brand.ctaLabel,
      agentName: ctx.brief.agentName,
      brokerage: ctx.brief.brokerage,
      seoFocus: ctx.feedback.seoFocus,
      // In later iterations the agent only reopens the hero/CTA debate when feedback asks for it.
      proposeHeadline: ctx.iteration === 1 || ctx.feedback.seoFocus,
      proposeCta: ctx.iteration === 1 || focus.includes("cta"),
    };
  },
  demo: (input) => {
    const heroHeadline = input.proposeHeadline ? `${capitalize(numberWord(input.bedrooms))}-Bedroom ${input.signatureAdj} ${input.typeTitle} in ${input.neighborhood}` : "";
    const metaTitle = truncate(`${input.name} | ${input.bedrooms}-Bedroom ${input.typeTitle === "House" ? "Home" : input.typeTitle} in ${input.neighborhood}`, 60);
    const metaDescription = truncate(
      `${capitalize(numberWord(input.bedrooms))}-bedroom ${input.typeTitle.toLowerCase()} with ${withArticle(input.leadAmenity)} in ${input.neighborhood}, ${input.city}. ${input.interior} interior${input.land ? ` on ${input.land}` : ""}. ${input.brandCta}.`,
      160,
    );
    const keywords = [
      `${input.neighborhood} ${input.typeTitle.toLowerCase()} for sale`,
      `${input.bedrooms} bedroom house ${input.city}`,
      `luxury home ${input.neighborhood}`,
      ...(input.seoFocus ? [`${input.leadAmenity} home ${input.city}`, `${input.neighborhood} real estate`] : []),
    ];
    return {
      summary: `Meta title ${metaTitle.length} chars, description ${metaDescription.length} chars, ${keywords.length} keywords${heroHeadline ? "; proposes a keyword-led hero" : ""}.`,
      rationale: `Search intent for this listing is location + bedrooms + property type. ${input.proposeHeadline ? `A keyword-led hero ("${heroHeadline}") is more explicit than the editorial option.` : ""}`.trim(),
      warnings: [],
      assumptions: ["Keyword phrases reflect likely search intent; no search-volume data is connected."],
      heroHeadline,
      ctaLabel: input.proposeCta ? "Schedule your viewing today" : "",
      ctaSupport: `Viewings are arranged privately with ${input.agentName}, ${input.brokerage}.`,
      metaTitle,
      metaDescription,
      slug: slugify(`${input.name} ${input.neighborhood} ${input.city}`),
      keywords,
      conversionNotes: ["Repeat the primary CTA in the hero and the inquiry section.", "Keep the inquiry form to three fields.", "Show the agent's name beside the form."],
    };
  },
  instructions: `You are Agent 10, Conversion and SEO.
Write a meta title (max 60 chars), meta description (max 160), a lowercase kebab-case slug, 3–5 keywords, a CTA supporting line and conversion notes.
If proposeHeadline is true, also propose a keyword-led hero headline (max 70 chars), otherwise return an empty string. If proposeCta is true, propose a conversion-oriented CTA label, otherwise an empty string.
${SHARED_RULES}`,
  accept: (o) => [
    criterion("Meta title is 60 characters or fewer", o.metaTitle.length <= 60, `${o.metaTitle.length} chars`),
    criterion("Meta description is 160 characters or fewer", o.metaDescription.length <= 160, `${o.metaDescription.length} chars`),
    criterion("Slug is lowercase kebab-case", /^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.slug), o.slug),
    criterion("At least three target keywords", o.keywords.length >= 3),
  ],
  proposals: (o) => [
    ...(o.heroHeadline
      ? [{ field: "landing.heroHeadline" as const, value: o.heroHeadline, rationale: "Keyword-led hero states location, bedrooms and type — clearer for search and for buyers arriving from portals.", evidence: o.keywords.slice(0, 2) }]
      : []),
    ...(o.ctaLabel
      ? [{ field: "landing.ctaLabel" as const, value: o.ctaLabel, rationale: "Action verb plus a time cue typically lifts click-through on inquiry CTAs (category heuristic, not measured here).", evidence: ["Conversion heuristic"] }]
      : []),
    { field: "landing.ctaSupport", value: o.ctaSupport, rationale: "Names the agent beside the CTA to make the next step concrete.", evidence: ["Brief · agent & brokerage"] },
    { field: "seo.metaTitle", value: o.metaTitle, rationale: "Leads with the property name and the highest-intent keyword.", evidence: o.keywords.slice(0, 1) },
    { field: "seo.metaDescription", value: o.metaDescription, rationale: "Facts-only summary with the calm CTA.", evidence: ["Brief · structured facts"] },
    { field: "seo.slug", value: o.slug, rationale: "Readable, stable URL built from name and location.", evidence: [] },
  ],
  summarize: (o) => o.summary,
};
