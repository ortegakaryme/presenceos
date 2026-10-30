import type { Campaign, CampaignContent } from "@/lib/domain/schemas";
import { currentContent } from "./apply";
import { draftContent } from "./draft";

/** What the public page shows for a campaign: live, a draft overlay, or a historical version. */
export function publicView(c: Campaign, view?: string, v?: string): { content: CampaignContent; label: string; showBanner: boolean } | null {
  if (view === "draft") {
    const d = draftContent(c);
    return { content: d.content, label: `Draft preview · v${c.currentVersion} + ${d.overlaid} unapplied proposals — not published`, showBanner: true };
  }
  if (v) {
    const version = c.versions.find((x) => x.number === Number(v));
    return version ? { content: version.content, label: `Historical version v${version.number}`, showBanner: true } : null;
  }
  return { content: currentContent(c), label: `Live page · v${c.currentVersion}${c.approval?.version === c.currentVersion ? " · approved" : " · not yet approved"}`, showBanner: false };
}
