"use client";

import { useEffect } from "react";

/** Records campaign_preview_opened once per mount. */
export function PreviewTracker({ campaignId, view }: { campaignId: string; view: string }) {
  useEffect(() => {
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "campaign_preview_opened", campaignId, props: { view } }) }).catch(() => undefined);
  }, [campaignId, view]);
  return null;
}
