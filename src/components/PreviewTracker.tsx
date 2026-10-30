"use client";

import { useEffect } from "react";
import { getStorageMode } from "@/lib/client/mode";
import { appendLocalEvents } from "@/lib/client/localStore";
import { newId, nowIso } from "@/lib/ids";

/** Records campaign_preview_opened once per mount. */
export function PreviewTracker({ campaignId, view }: { campaignId: string; view: string }) {
  useEffect(() => {
    if (getStorageMode() === "browser") {
      appendLocalEvents([{ id: newId("evt"), name: "campaign_preview_opened", at: nowIso(), campaignId, props: { view } }]);
      return;
    }
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "campaign_preview_opened", campaignId, props: { view } }) }).catch(() => undefined);
  }, [campaignId, view]);
  return null;
}
