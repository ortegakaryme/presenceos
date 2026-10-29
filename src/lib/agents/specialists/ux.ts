import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { criterion } from "../helpers";
import type { AudienceOutput } from "./audience";
import type { PositioningOutput } from "./positioning";
import { SectionKeySchema, type SectionKey } from "@/lib/domain/schemas";

const Input = z.object({
  primarySegment: z.string(),
  needs: z.array(z.string()),
  pillars: z.array(z.string()),
  imageCount: z.number(),
});
const Output = z.object({
  ...baseOutputShape,
  sectionOrder: z.array(SectionKeySchema),
  journey: z.array(z.object({ step: z.string(), intent: z.string(), content: z.string() })),
  hierarchyNotes: z.array(z.string()),
});
export type UxOutput = z.infer<typeof Output>;

const REQUIRED: SectionKey[] = ["facts", "gallery", "inquiry"];

export const uxAgent: AgentDefinition<z.infer<typeof Input>, UxOutput> = {
  id: "ux",
  number: "09",
  name: "Landing Page UX",
  purpose: "Recommends page structure, information hierarchy, content placement and the intended user journey.",
  dependsOn: ["audience", "positioning"],
  kind: "llm",
  acceptanceCriteria: [
    "Section order includes key facts, gallery and inquiry",
    "No duplicate sections",
    "Inquiry is the final section",
    "Journey describes at least four steps",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Structuring the page and buyer journey",
  buildInput: (ctx) => {
    const a = upstream<AudienceOutput>(ctx, "audience");
    const p = upstream<PositioningOutput>(ctx, "positioning");
    return {
      primarySegment: a.primarySegment,
      needs: a.segments.flatMap((s) => s.needs).slice(0, 5),
      pillars: p.pillars.map((x) => x.title),
      imageCount: ctx.brief.images.length,
    };
  },
  demo: (input) => {
    const order: SectionKey[] = ["facts", "story", "gallery", "features", "amenities", "location", "inquiry"];
    return {
      summary: "Facts-first structure: key facts directly under the hero, story, then gallery, ending in a private-viewing inquiry.",
      rationale: `${input.primarySegment} scan for price, size and bedrooms before committing time to imagery; putting facts first reduces pogo-sticking and qualifies inquiries.`,
      warnings: input.imageCount < 5 ? ["Limited photography — consider a shorter gallery."] : [],
      assumptions: ["Facts-first ordering is a UX hypothesis; Agent 12 proposes testing it."],
      sectionOrder: order,
      journey: [
        { step: "Arrive", intent: "Confirm this is the right property", content: "Hero image, headline, location" },
        { step: "Qualify", intent: "Check price and size", content: "Key facts bar" },
        { step: "Imagine", intent: "Understand the house", content: `Story built on ${input.pillars.slice(0, 2).join(" and ").toLowerCase()}` },
        { step: "Explore", intent: "See the spaces", content: "Gallery, features and amenities" },
        { step: "Act", intent: "Arrange a viewing", content: "Inquiry form with agent details" },
      ],
      hierarchyNotes: ["One primary CTA, repeated in the hero and at the end.", "Facts as numerals, not prose.", "Keep amenities scannable as a list."],
    };
  },
  instructions: `You are Agent 09, Landing Page UX.
Recommend the section order (keys: facts, story, gallery, features, amenities, location, inquiry; each at most once; inquiry last), a buyer journey and hierarchy notes.
${SHARED_RULES}`,
  accept: (o) => [
    criterion("Section order includes key facts, gallery and inquiry", REQUIRED.every((r) => o.sectionOrder.includes(r))),
    criterion("No duplicate sections", new Set(o.sectionOrder).size === o.sectionOrder.length),
    criterion("Inquiry is the final section", o.sectionOrder[o.sectionOrder.length - 1] === "inquiry"),
    criterion("Journey describes at least four steps", o.journey.length >= 4),
  ],
  proposals: (o) => [
    { field: "landing.sectionOrder", value: o.sectionOrder, rationale: o.rationale, evidence: ["Agent 01 · primary segment needs"] },
  ],
  summarize: (o) => o.summary,
};
