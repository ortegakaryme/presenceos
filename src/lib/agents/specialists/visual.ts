import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { criterion } from "../helpers";
import type { BrandOutput } from "./brand";
import type { FactsOutput } from "./facts";
import type { PositioningOutput } from "./positioning";
import { SectionKeySchema, type SectionKey } from "@/lib/domain/schemas";

const Input = z.object({
  propertyType: z.string(),
  images: z.array(z.object({ id: z.string(), caption: z.string() })),
  imageFlags: z.array(z.object({ imageId: z.string(), issue: z.string() })),
  visualDirection: z.string(),
  leadPillar: z.string(),
  emphasis: z.array(z.string()),
});
const Output = z.object({
  ...baseOutputShape,
  heroImageId: z.string(),
  galleryImageIds: z.array(z.string()),
  excludedImages: z.array(z.object({ imageId: z.string(), reason: z.string() })),
  shotNotes: z.array(z.object({ imageId: z.string(), role: z.string(), note: z.string() })),
  sectionOrder: z.array(SectionKeySchema),
  direction: z.string(),
  generatesImages: z.literal(false).describe("PresenceOS does not generate or edit images."),
});
export type VisualOutput = z.infer<typeof Output>;

const ROLE_ORDER: { re: RegExp; role: string }[] = [
  { re: /fa[cç]ade|exterior|dusk|elevation|villa\b|house\b|coast|shoreline/i, role: "Exterior" },
  { re: /garden|terrace|pool|forest|view|bay|deck/i, role: "Landscape" },
  { re: /living|family|lounge/i, role: "Living" },
  { re: /kitchen|dining/i, role: "Kitchen" },
  { re: /entrance|entry|hall/i, role: "Arrival" },
  { re: /bed|suite/i, role: "Private rooms" },
  { re: /bath/i, role: "Private rooms" },
];

function roleOf(caption: string, interiorFirst = false): { role: string; rank: number } {
  const i = ROLE_ORDER.findIndex((r) => r.re.test(caption));
  if (i === -1) return { role: "Detail", rank: ROLE_ORDER.length };
  const role = ROLE_ORDER[i].role;
  // Penthouses and apartments sell the interior and the view, not a façade.
  return { role, rank: interiorFirst && role === "Living" ? -1 : i };
}

export const visualAgent: AgentDefinition<z.infer<typeof Input>, VisualOutput> = {
  id: "visual",
  number: "07",
  name: "Visual Creative Director",
  purpose: "Recommends image selection, visual hierarchy and photography usage. Does not generate or edit images.",
  dependsOn: ["facts", "brand", "positioning"],
  kind: "llm",
  acceptanceCriteria: [
    "Hero image exists in the supplied photos",
    "Gallery has at least three supplied photos",
    "No flagged photo is used in the hero or gallery",
    "Declares that no images were generated or edited",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Selecting hero and gallery photography from supplied images",
  buildInput: (ctx) => {
    const facts = upstream<FactsOutput>(ctx, "facts");
    const brand = upstream<BrandOutput>(ctx, "brand");
    const pos = upstream<PositioningOutput>(ctx, "positioning");
    return {
      propertyType: ctx.brief.propertyType,
      images: ctx.brief.images.map((i) => ({ id: i.id, caption: i.caption })),
      imageFlags: facts.imageFlags,
      visualDirection: brand.visualDirection,
      leadPillar: pos.pillars[0]?.title ?? "",
      emphasis: ctx.feedback.emphasis,
    };
  },
  demo: (input) => {
    const flagged = new Set(input.imageFlags.map((f) => f.imageId));
    const usable = input.images.filter((i) => !flagged.has(i.id));
    const interiorFirst = ["penthouse", "apartment"].includes(input.propertyType);
    const ranked = [...usable].sort((a, b) => roleOf(a.caption, interiorFirst).rank - roleOf(b.caption, interiorFirst).rank);
    const emphasised = ranked.find((i) => input.emphasis.some((e) => i.caption.toLowerCase().includes(e.toLowerCase().split(" ")[0])));
    const hero = emphasised ?? ranked[0];
    const gallery = ranked.filter((i) => i.id !== hero?.id).slice(0, 8);
    const order: SectionKey[] = ["gallery", "story", "facts", "features", "amenities", "location", "inquiry"];
    return {
      summary: `Hero: "${hero?.caption ?? "—"}". ${gallery.length} gallery images, ${flagged.size} excluded.`,
      rationale: `Exterior and landscape frames establish the ${input.leadPillar.toLowerCase() || "setting"} before interiors; flagged photos are excluded so imagery cannot imply unverified amenities.`,
      warnings: usable.length < 4 ? ["Fewer than four usable photos — the gallery will feel thin."] : [],
      assumptions: ["Image content is inferred from captions; PresenceOS does not analyse pixels."],
      heroImageId: hero?.id ?? "",
      galleryImageIds: gallery.map((g) => g.id),
      excludedImages: input.imageFlags.map((f) => ({ imageId: f.imageId, reason: f.issue })),
      shotNotes: [hero, ...gallery].filter(Boolean).map((i) => ({ imageId: i.id, role: roleOf(i.caption).role, note: i.caption })),
      sectionOrder: order,
      direction: `${input.visualDirection} Sequence: exterior → landscape → living → kitchen → private rooms.`,
      generatesImages: false,
    };
  },
  instructions: `You are Agent 07, Visual Creative Director.
Choose a hero image and an ordered gallery from the supplied photos only (by id), exclude any photo listed in imageFlags, write shot notes, and recommend a visual-first section order.
You cannot see pixels: reason from captions and say so. PresenceOS does not generate or edit images — generatesImages must be false.
Allowed section keys: facts, story, gallery, features, amenities, location, inquiry.
${SHARED_RULES}`,
  accept: (o, i) => {
    const ids = new Set(i.images.map((x) => x.id));
    const flagged = new Set(i.imageFlags.map((f) => f.imageId));
    return [
      criterion("Hero image exists in the supplied photos", ids.has(o.heroImageId), o.heroImageId),
      criterion("Gallery has at least three supplied photos", o.galleryImageIds.length >= 3 && o.galleryImageIds.every((g) => ids.has(g)), `${o.galleryImageIds.length} photos`),
      criterion("No flagged photo is used in the hero or gallery", !flagged.has(o.heroImageId) && o.galleryImageIds.every((g) => !flagged.has(g))),
      criterion("Declares that no images were generated or edited", o.generatesImages === false),
    ];
  },
  proposals: (o) => [
    { field: "landing.heroImageId", value: o.heroImageId, rationale: o.rationale, evidence: o.shotNotes.slice(0, 1).map((s) => `Photo · ${s.note}`) },
    { field: "landing.galleryImageIds", value: o.galleryImageIds, rationale: `Sequenced ${o.direction.split("Sequence:")[1]?.trim() ?? "by room type"}. Excluded: ${o.excludedImages.map((e) => e.imageId).join(", ") || "none"}.`, evidence: o.excludedImages.map((e) => `${e.imageId}: ${e.reason}`) },
    { field: "landing.sectionOrder", value: o.sectionOrder, rationale: "Visual-first: open with the gallery so photography sets the tone before any text.", evidence: ["Agent 04 · visual direction"] },
  ],
  summarize: (o) => o.summary,
};
