import type { Campaign } from "@/lib/domain/schemas";
import { AGENT_ORDER } from "@/lib/agents/registry";
import type { AgentId } from "@/lib/domain/schemas";
import { criticalOpen, stageOf } from "@/lib/domain/stage";
import type { AnalyticsEvent } from "./events";

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface AgentStats {
  agentId: AgentId;
  started: number;
  completed: number;
  failedAttempts: number;
  finalFailures: number;
  medianDurationMs: number | null;
}

export interface Metrics {
  campaigns: number;
  exampleCampaigns: number;
  eventsRecorded: number;
  timeToFirstDraftMs: number | null;
  timeToApprovalMs: number | null;
  firstPassApprovalRate: number | null;
  firstPassDecisions: number;
  revisionsPerCampaign: number | null;
  iterations: number;
  unresolvedCritical: number;
  unresolvedWarnings: number;
  completionRate: number | null;
  draftedCampaigns: number;
  approvedCampaigns: number;
  agents: AgentStats[];
  perCampaign: {
    id: string;
    origin: "user" | "example";
    name: string;
    stage: string;
    timeToFirstDraftMs: number | null;
    timeToApprovalMs: number | null;
    versions: number;
    iterations: number;
    critical: number;
  }[];
}

/** All metrics are derived from events recorded by this instance (plus current QA state). */
export function computeMetrics(allCampaigns: Campaign[], allEvents: AnalyticsEvent[]): Metrics {
  // Example campaigns and seed activity are not user workflow — exclude them from aggregates.
  const campaigns = allCampaigns.filter((c) => c.origin !== "example");
  const events = allEvents.filter((e) => e.props.source !== "seed");
  const byCampaign = new Map<string, AnalyticsEvent[]>();
  for (const e of events) if (e.campaignId) byCampaign.set(e.campaignId, [...(byCampaign.get(e.campaignId) ?? []), e]);
  const first = (evs: AnalyticsEvent[], name: string) => evs.find((e) => e.name === name);

  const perCampaign = allCampaigns.map((c) => {
    const evs = byCampaign.get(c.id) ?? [];
    const submitted = first(evs, "property_brief_submitted");
    const draft = first(evs, "campaign_draft_created");
    const approved = first(evs, "campaign_approved");
    return {
      id: c.id,
      origin: c.origin ?? "user",
      name: c.brief.name,
      stage: stageOf(c),
      timeToFirstDraftMs: submitted && draft ? Date.parse(draft.at) - Date.parse(submitted.at) : null,
      timeToApprovalMs: draft && approved ? Date.parse(approved.at) - Date.parse(draft.at) : null,
      versions: c.versions.length,
      iterations: evs.filter((e) => e.name === "iteration_started").length,
      critical: criticalOpen(c),
    };
  });

  const firstPass = events.filter((e) => (e.name === "proposal_approved" || e.name === "proposal_rejected") && e.props.iteration === 1 && e.props.bulk !== "superseded");
  const firstPassOk = firstPass.filter((e) => e.name === "proposal_approved" && !e.props.edited).length;

  const agents: AgentStats[] = AGENT_ORDER.map((agentId) => {
    const mine = events.filter((e) => e.props.agentId === agentId);
    return {
      agentId,
      started: mine.filter((e) => e.name === "agent_run_started").length,
      completed: mine.filter((e) => e.name === "agent_run_completed").length,
      failedAttempts: mine.filter((e) => e.name === "agent_run_failed").length,
      finalFailures: mine.filter((e) => e.name === "agent_run_failed" && e.props.final).length,
      medianDurationMs: median(mine.filter((e) => e.name === "agent_run_completed").map((e) => Number(e.props.durationMs)).filter(Number.isFinite)),
    };
  });

  const drafted = campaigns.filter((c) => c.runs.some((r) => r.status !== "running"));
  const approvedCampaigns = campaigns.filter((c) => c.approval).length;
  return {
    campaigns: campaigns.length,
    exampleCampaigns: allCampaigns.length - campaigns.length,
    eventsRecorded: events.length,
    timeToFirstDraftMs: median(perCampaign.map((p) => p.timeToFirstDraftMs).filter((x): x is number => x != null)),
    timeToApprovalMs: median(perCampaign.map((p) => p.timeToApprovalMs).filter((x): x is number => x != null)),
    firstPassApprovalRate: firstPass.length ? firstPassOk / firstPass.length : null,
    firstPassDecisions: firstPass.length,
    revisionsPerCampaign: campaigns.length ? campaigns.reduce((s, c) => s + (c.versions.length - 1), 0) / campaigns.length : null,
    iterations: events.filter((e) => e.name === "iteration_started").length,
    unresolvedCritical: campaigns.reduce((s, c) => s + criticalOpen(c), 0),
    unresolvedWarnings: campaigns.reduce((s, c) => s + (c.qa?.issues.filter((i) => i.severity === "warning").length ?? 0), 0),
    completionRate: drafted.length ? approvedCampaigns / drafted.length : null,
    draftedCampaigns: drafted.length,
    approvedCampaigns,
    agents,
    perCampaign,
  };
}
