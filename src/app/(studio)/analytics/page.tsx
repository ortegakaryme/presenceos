import type { Metadata } from "next";
import { listCampaigns, listEvents } from "@/lib/server/campaigns";
import { storageMode } from "@/lib/server/store";
import { computeMetrics } from "@/lib/analytics/metrics";
import { AnalyticsView } from "@/components/AnalyticsView";
import { LocalAnalytics } from "@/components/LocalAnalytics";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [campaigns, events] = await Promise.all([listCampaigns(), listEvents()]);
  if (storageMode() === "browser") {
    // Metrics come from this browser's own events and campaigns; examples are passed for the table.
    return <LocalAnalytics examples={campaigns.filter((c) => c.origin === "example")} />;
  }
  const names = Object.fromEntries(campaigns.map((c) => [c.id, c.brief.name]));
  return <AnalyticsView m={computeMetrics(campaigns, events)} events={events} names={names} />;
}
