import { z } from "zod";
import {
  FeatureSchema,
  SectionKeySchema,
  VideoSceneSchema,
  type CampaignContent,
  type FieldValue,
} from "./schemas";

export type FieldKind = "text" | "longtext" | "paragraphs" | "list" | "features" | "scenes" | "image" | "images" | "sections";

export type Component = "Landing page" | "Listing" | "Social" | "Video" | "Brand" | "SEO" | "Positioning";

export interface FieldSpec {
  label: string;
  component: Component;
  kind: FieldKind;
  /** Required for the campaign to be considered complete by QA. */
  required: boolean;
  maxLength?: number;
}

export const FIELDS = {
  "positioning.statement": { label: "Positioning statement", component: "Positioning", kind: "longtext", required: true, maxLength: 240 },
  "brand.voice": { label: "Brand voice", component: "Brand", kind: "longtext", required: true },
  "brand.guardrails": { label: "Creative guardrails", component: "Brand", kind: "list", required: true },
  "landing.heroHeadline": { label: "Hero headline", component: "Landing page", kind: "text", required: true, maxLength: 70 },
  "landing.heroSubheadline": { label: "Hero subheadline", component: "Landing page", kind: "text", required: true, maxLength: 140 },
  "landing.intro": { label: "Editorial introduction", component: "Landing page", kind: "longtext", required: true, maxLength: 420 },
  "landing.description": { label: "Property description", component: "Landing page", kind: "paragraphs", required: true },
  "landing.features": { label: "Feature highlights", component: "Landing page", kind: "features", required: true },
  "landing.locationCopy": { label: "Location copy", component: "Landing page", kind: "longtext", required: true },
  "landing.ctaLabel": { label: "Primary call to action", component: "Landing page", kind: "text", required: true, maxLength: 32 },
  "landing.ctaSupport": { label: "CTA supporting line", component: "Landing page", kind: "text", required: false, maxLength: 160 },
  "landing.sectionOrder": { label: "Page section order", component: "Landing page", kind: "sections", required: true },
  "landing.heroImageId": { label: "Hero image", component: "Landing page", kind: "image", required: true },
  "landing.galleryImageIds": { label: "Gallery selection", component: "Landing page", kind: "images", required: true },
  "listing.headlines": { label: "Headline alternatives", component: "Listing", kind: "list", required: true },
  "listing.copy": { label: "Listing copy", component: "Listing", kind: "longtext", required: true },
  "social.instagram": { label: "Instagram caption", component: "Social", kind: "longtext", required: false, maxLength: 2200 },
  "social.linkedin": { label: "LinkedIn post", component: "Social", kind: "longtext", required: false, maxLength: 3000 },
  "social.facebook": { label: "Facebook post", component: "Social", kind: "longtext", required: false },
  "social.email": { label: "Email announcement", component: "Social", kind: "longtext", required: false },
  "video.scenes": { label: "Reel script", component: "Video", kind: "scenes", required: true },
  "seo.metaTitle": { label: "Meta title", component: "SEO", kind: "text", required: true, maxLength: 60 },
  "seo.metaDescription": { label: "Meta description", component: "SEO", kind: "text", required: true, maxLength: 160 },
  "seo.slug": { label: "URL slug", component: "SEO", kind: "text", required: true, maxLength: 80 },
} as const satisfies Record<string, FieldSpec>;

export type FieldPath = keyof typeof FIELDS;
export const FIELD_PATHS = Object.keys(FIELDS) as FieldPath[];

export function isFieldPath(p: string): p is FieldPath {
  return p in FIELDS;
}

export function fieldSpec(path: string): FieldSpec {
  if (!isFieldPath(path)) throw new Error(`Unknown field: ${path}`);
  return FIELDS[path];
}

const valueSchemas: Record<FieldKind, z.ZodType<FieldValue>> = {
  text: z.string(),
  longtext: z.string(),
  image: z.string(),
  paragraphs: z.array(z.string()),
  list: z.array(z.string()),
  images: z.array(z.string()),
  sections: z.array(SectionKeySchema),
  features: z.array(FeatureSchema),
  scenes: z.array(VideoSceneSchema),
};

export function valueSchemaFor(path: string): z.ZodType<FieldValue> {
  return valueSchemas[fieldSpec(path).kind];
}

export function getField(content: CampaignContent, path: string): FieldValue {
  const [group, key] = path.split(".");
  const g = (content as unknown as Record<string, Record<string, FieldValue>>)[group];
  if (!g || !(key in g)) throw new Error(`Unknown field: ${path}`);
  return g[key];
}

/** Immutable setter — returns a new content object. */
export function setField(content: CampaignContent, path: string, value: FieldValue): CampaignContent {
  fieldSpec(path);
  const [group, key] = path.split(".");
  const c = structuredClone(content) as unknown as Record<string, Record<string, FieldValue>>;
  c[group] = { ...c[group], [key]: structuredClone(value) };
  return c as unknown as CampaignContent;
}

export function isEmptyValue(v: FieldValue | null | undefined): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  return v.length === 0;
}

export function valuesEqual(a: FieldValue | null | undefined, b: FieldValue | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** Flattens any field value to plain text — used for fact checks and diffs. */
export function valueToText(v: FieldValue | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v
    .map((item) => {
      if (typeof item === "string") return item;
      if ("title" in item) return `${item.title}. ${item.body}`;
      return `${item.voiceover} ${item.onScreen}`;
    })
    .join("\n");
}

/** Fields whose text is published to an audience and therefore subject to fact/brand checks. */
export const PUBLISHED_TEXT_FIELDS: FieldPath[] = FIELD_PATHS.filter((p) => {
  const k = FIELDS[p].kind;
  return !["image", "images", "sections"].includes(k) && !p.startsWith("brand.") && p !== "seo.slug";
});

export function emptyContent(): CampaignContent {
  return {
    positioning: { statement: "" },
    brand: { voice: "", guardrails: [] },
    landing: {
      heroHeadline: "",
      heroSubheadline: "",
      intro: "",
      description: [],
      features: [],
      locationCopy: "",
      ctaLabel: "",
      ctaSupport: "",
      sectionOrder: [],
      heroImageId: "",
      galleryImageIds: [],
    },
    listing: { headlines: [], copy: "" },
    social: { instagram: "", linkedin: "", facebook: "", email: "" },
    video: { scenes: [] },
    seo: { metaTitle: "", metaDescription: "", slug: "" },
  };
}
