import type { Campaign } from "./schemas";
import { STAGE_LABEL, criticalOpen, stageOf, type Stage } from "./stage";
import { currentContent } from "@/lib/builder/apply";

/** Lightweight card data for campaign lists (computed on the server or in the browser). */
export interface CampaignSummary {
  id: string;
  origin: "user" | "example";
  name: string;
  neighborhood: string;
  city: string;
  price: { amount: number; currency: string };
  stage: Stage;
  stageLabel: string;
  version: number;
  pending: number;
  critical: number;
  heroUrl?: string;
  heroCaption?: string;
  updatedAt: string;
}

export function summarize(c: Campaign): CampaignSummary {
  const content = currentContent(c);
  const hero = c.brief.images.find((i) => i.id === content.landing.heroImageId) ?? c.brief.images[0];
  const stage = stageOf(c);
  return {
    id: c.id,
    origin: c.origin ?? "user",
    name: c.brief.name,
    neighborhood: c.brief.neighborhood,
    city: c.brief.city,
    price: c.brief.price,
    stage,
    stageLabel: STAGE_LABEL[stage],
    version: c.currentVersion,
    pending: c.proposals.filter((p) => p.status === "pending").length,
    critical: criticalOpen(c),
    heroUrl: hero?.url,
    heroCaption: hero?.caption,
    updatedAt: c.updatedAt,
  };
}
