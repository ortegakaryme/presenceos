import type { CampaignContent, PropertyBrief } from "@/lib/domain/schemas";
import { emptyContent } from "@/lib/domain/fields";
import { checkImageCaption, indexBrief } from "./factcheck";

/**
 * Version 1: a facts-only skeleton the Builder creates from the brief. It contains no
 * generated copy, so nothing reaches the live page without a human approval.
 */
export function baselineContent(brief: PropertyBrief): CampaignContent {
  const c = emptyContent();
  c.landing.heroHeadline = brief.name;
  c.landing.heroSubheadline = `${brief.neighborhood}, ${brief.city}`;
  c.landing.sectionOrder = ["facts", "gallery", "amenities", "inquiry"];
  const idx = indexBrief(brief);
  const safe = brief.images.filter((i) => checkImageCaption(i.caption, idx).length === 0);
  c.landing.heroImageId = safe[0]?.id ?? "";
  c.landing.galleryImageIds = safe.slice(1, 7).map((i) => i.id);
  c.landing.ctaLabel = "Contact the listing agent";
  return c;
}
