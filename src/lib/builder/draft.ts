import type { Campaign, CampaignContent } from "@/lib/domain/schemas";
import { setField } from "@/lib/domain/fields";
import { currentContent, effectiveValue } from "./apply";

/**
 * Preview-only composition: current approved content plus approved-but-unapplied changes and
 * pending proposals (the Builder's recommendation where agents conflict). Blocked proposals are
 * never previewed. This never changes stored state.
 */
export function draftContent(c: Campaign): { content: CampaignContent; overlaid: number } {
  let content = currentContent(c);
  let overlaid = 0;
  const candidates = c.proposals.filter((p) => (p.status === "approved" || p.status === "pending") && p.validation.status !== "blocked");
  for (const p of candidates) {
    if (p.status === "pending" && p.conflictId) {
      const k = c.conflicts.find((x) => x.id === p.conflictId);
      if (k && k.status === "open" && k.recommendation.proposalId !== p.id) continue;
    }
    content = setField(content, p.field, effectiveValue(p));
    overlaid++;
  }
  // Approved decisions win over pending ones for the same field.
  for (const p of candidates.filter((x) => x.status === "approved")) content = setField(content, p.field, effectiveValue(p));
  return { content, overlaid };
}
