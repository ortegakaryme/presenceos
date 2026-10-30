"use client";

import { useMemo } from "react";
import type { Campaign } from "@/lib/domain/schemas";
import { computeMetrics } from "@/lib/analytics/metrics";
import { listLocalCampaigns, listLocalEvents, useLocalRevision } from "@/lib/client/localStore";
import { AnalyticsView } from "./AnalyticsView";

/** Browser-storage mode: metrics from the events and campaigns saved in this browser. */
export function LocalAnalytics({ examples }: { examples: Campaign[] }) {
  const rev = useLocalRevision();
  const data = useMemo(() => {
    const byId = new Map(examples.map((c) => [c.id, c]));
    const events = rev === null ? [] : listLocalEvents();
    if (rev !== null) for (const c of listLocalCampaigns()) byId.set(c.id, c);
    return { campaigns: [...byId.values()], events };
  }, [examples, rev]);
  const names = Object.fromEntries(data.campaigns.map((c) => [c.id, c.brief.name]));
  return <AnalyticsView m={computeMetrics(data.campaigns, data.events)} events={data.events} names={names} scopeNote="On this demo, events are stored in this browser only." />;
}
