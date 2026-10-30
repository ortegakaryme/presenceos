import Link from "next/link";
import type { Metrics } from "@/lib/analytics/metrics";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { AGENTS } from "@/lib/agents/registry";
import { STAGE_LABEL, type Stage } from "@/lib/domain/stage";
import { Badge, Card, EmptyState, SectionHeading, Stat } from "./ui";
import { formatDuration, formatTime } from "@/lib/format";
import { EVENT_NAMES } from "@/lib/analytics/events";
import { QuickStart } from "./QuickStart";

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

/** Presentational analytics dashboard; metrics are computed by the caller (server or browser). */
export function AnalyticsView({ m, events, names, scopeNote }: { m: Metrics; events: AnalyticsEvent[]; names: Record<string, string>; scopeNote?: string }) {
  const recent = [...events].reverse().slice(0, 40);
  const counts = EVENT_NAMES.map((n) => [n, events.filter((e) => e.name === n).length] as const);
  const campaigns = m.perCampaign;
  return (
    <div className="mx-auto grid max-w-[88rem] gap-10 px-4 py-10 md:px-8">
      <SectionHeading eyebrow="Product analytics" title="Workflow metrics">
        Every number on this page is derived from events recorded by this local instance ({m.eventsRecorded} events). No synthetic or sample data is used, and nothing here describes real customer or business performance. The {m.exampleCampaigns} preloaded example campaigns and their seed activity are excluded from the aggregates; your own actions on examples (approvals, iterations) are counted.{scopeNote ? ` ${scopeNote}` : ""}
      </SectionHeading>

      {campaigns.length === 0 && m.exampleCampaigns === 0 ? (
        <EmptyState title="No events recorded yet" action={<QuickStart variant="secondary" />}>
          Run a campaign to generate instrumented events.
        </EmptyState>
      ) : (
        <>
          <Card className="grid gap-y-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Time to first draft" value={formatDuration(m.timeToFirstDraftMs)} hint="Median · brief submitted → Builder synthesis" />
            <Stat label="Time to approval" value={formatDuration(m.timeToApprovalMs)} hint={`Median · draft → campaign approved (${m.approvedCampaigns} approved)`} />
            <Stat label="First-pass approval" value={pct(m.firstPassApprovalRate)} hint={`Iteration-1 decisions approved without edits · n=${m.firstPassDecisions}`} />
            <Stat label="Completion rate" value={pct(m.completionRate)} hint={`${m.approvedCampaigns} of ${m.draftedCampaigns} drafted campaigns approved`} />
            <Stat label="Revisions / campaign" value={m.revisionsPerCampaign == null ? "—" : m.revisionsPerCampaign.toFixed(1)} hint="Versions created after the baseline" />
            <Stat label="Iterations requested" value={m.iterations} hint="Feedback-driven reruns" />
            <Stat label="Unresolved critical QA" value={m.unresolvedCritical} hint="Current state across campaigns" />
            <Stat label="Unresolved QA warnings" value={m.unresolvedWarnings} hint="Current state across campaigns" />
          </Card>

          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="agents-h">
              <h2 id="agents-h" className="font-display text-2xl text-ink">Agent execution</h2>
              <p className="mt-1 text-xs text-stone">From agent_run_started / completed / failed events. Failed attempts include Builder rejections that were retried.</p>
              <Card className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line"><tr className="[&>th]:eyebrow [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium [&>th]:text-stone"><th>Agent</th><th className="text-right">Runs</th><th className="text-right">Completed</th><th className="text-right">Failed attempts</th><th className="text-right">Final failures</th><th className="text-right">Median time</th></tr></thead>
                  <tbody>
                    {m.agents.map((a) => (
                      <tr key={a.agentId} className="border-b border-line last:border-0">
                        <td className="px-4 py-2"><span className="eyebrow mr-2 text-taupe">{AGENTS[a.agentId].number}</span>{AGENTS[a.agentId].name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.started}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.completed}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.failedAttempts ? <Badge tone="warn">{a.failedAttempts} failed</Badge> : 0}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{a.finalFailures ? <Badge tone="bad">{a.finalFailures} final</Badge> : 0}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-stone">{formatDuration(a.medianDurationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <p className="mt-2 text-xs text-stone">In demo mode durations include configured pacing (DEMO_AGENT_DELAY_MS) and do not represent model latency.</p>
            </section>

            <section aria-labelledby="camp-h">
              <h2 id="camp-h" className="font-display text-2xl text-ink">By campaign</h2>
              <Card className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line"><tr className="[&>th]:eyebrow [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium [&>th]:text-stone"><th>Campaign</th><th>Stage</th><th className="text-right">First draft</th><th className="text-right">Approval</th><th className="text-right">Versions</th><th className="text-right">Critical</th></tr></thead>
                  <tbody>
                    {m.perCampaign.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2"><Link href={`/campaigns/${p.id}`} className="hover:underline">{p.name}</Link>{p.origin === "example" && <Badge className="ml-2">Example</Badge>}</td>
                        <td className="px-4 py-2 text-xs">{STAGE_LABEL[p.stage as Stage]}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatDuration(p.timeToFirstDraftMs)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatDuration(p.timeToApprovalMs)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{p.versions}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{p.critical}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <h2 className="font-display mt-8 text-2xl text-ink">Event taxonomy</h2>
              <Card className="mt-3 p-4">
                <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {counts.map(([n, k]) => (
                    <li key={n} className="flex justify-between gap-3 border-b border-line/70 pb-1.5"><code className="text-xs text-charcoal">{n}</code><span className="tabular-nums text-stone">{k}</span></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-stone">Events are stored locally. <code>forwardEvent()</code> in <code>src/lib/analytics/events.ts</code> is the integration point for a product-analytics service; none is connected.</p>
              </Card>
            </section>
          </div>

          <section aria-labelledby="log-h">
            <h2 id="log-h" className="font-display text-2xl text-ink">Recent events</h2>
            <Card className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-xs">
                <thead className="border-b border-line"><tr className="[&>th]:eyebrow [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium [&>th]:text-stone"><th>Time</th><th>Event</th><th>Campaign</th><th>Properties</th></tr></thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-1.5 text-stone">{formatTime(e.at)}</td>
                      <td className="px-4 py-1.5"><code>{e.name}</code></td>
                      <td className="px-4 py-1.5 text-stone">{e.campaignId ? names[e.campaignId] ?? "(deleted)" : "—"}</td>
                      <td className="max-w-xl truncate px-4 py-1.5 font-mono text-[0.65rem] text-stone">{JSON.stringify(e.props)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
