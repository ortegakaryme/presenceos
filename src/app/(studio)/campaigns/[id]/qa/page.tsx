"use client";

import { useCampaign } from "@/lib/client/CampaignContext";
import { canApproveCampaign } from "@/lib/domain/stage";
import { FIELDS, isFieldPath } from "@/lib/domain/fields";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, EmptyState, Notice, Stat, cx } from "@/components/ui";
import type { FactsOutput } from "@/lib/agents/specialists/facts";
import type { QaOutput } from "@/lib/agents/specialists/qa";
import type { MarketOutput } from "@/lib/agents/specialists/market";
import { formatTime } from "@/lib/format";

const FACT_TONE = { verified: "ok", user_provided: "warn", assumption: "info", missing: "bad" } as const;
const FACT_LABEL = { verified: "Verified", user_provided: "User-provided · unverified", assumption: "Assumption", missing: "Missing" } as const;

export default function QAPage() {
  const { campaign: c, act, busy } = useCampaign();
  const qa = c.qa;
  const gate = canApproveCampaign(c);
  const latestOutput = <T,>(id: "facts" | "qa" | "market"): T | undefined => {
    for (const r of [...c.runs].reverse()) if (r.agents[id]?.output) return r.agents[id].output as T;
  };
  const facts = latestOutput<FactsOutput>("facts");
  const qaAgent = latestOutput<QaOutput>("qa");
  const market = latestOutput<MarketOutput>("market");
  if (!qa) return <EmptyState title="QA has not run yet" />;
  const crit = qa.issues.filter((i) => i.severity === "critical");
  const warn = qa.issues.filter((i) => i.severity === "warning");
  const approvedNow = c.approval?.version === c.currentVersion;

  return (
    <div className="grid gap-8">
      <Card className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-wrap gap-y-4">
          <Stat label="Critical" value={crit.length} tone={crit.length ? "bad" : "ok"} hint="Blocks approval" />
          <Stat label="Warnings" value={warn.length} tone={warn.length ? "warn" : undefined} hint="Review recommended" />
          <Stat label="Checks passing" value={`${qa.checks.filter((x) => x.passed).length}/${qa.checks.length}`} />
          <Stat label="Checked" value={`v${qa.version}`} hint={formatTime(qa.ranAt)} />
        </div>
        <div className="grid gap-2 md:justify-items-end">
          {approvedNow ? (
            <Badge tone="dark">v{c.currentVersion} approved {formatTime(c.approval!.at)}</Badge>
          ) : (
            <Button disabled={!gate.ok || !!busy} onClick={() => act("approve", () => api(`/api/campaigns/${c.id}/approve`, { body: {} }))}>
              Approve campaign v{c.currentVersion}
            </Button>
          )}
          {!gate.ok && !approvedNow && <ul className="text-xs text-stone md:text-right">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        </div>
      </Card>

      {crit.length > 0 && <Notice tone="bad" title="Not approvable">Critical issues must be resolved first. Approve a corrected proposal, edit the field in the Studio, or restore an earlier version.</Notice>}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="checks-h">
          <h2 id="checks-h" className="font-display text-2xl text-ink">Checks · v{qa.version}</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {qa.checks.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                <span className="flex items-start gap-2"><span aria-hidden className={x.passed ? "text-ok" : "text-bad"}>{x.passed ? "✓" : "✕"}</span>{x.label}<span className="sr-only">{x.passed ? "passed" : "failed"}</span></span>
                <span className="text-right text-xs text-stone">{x.detail}</span>
              </li>
            ))}
          </ul>
          <h3 className="eyebrow mt-6 text-stone">Regression tests (after last apply)</h3>
          {qa.regression.length ? (
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {qa.regression.map((x) => (
                <li key={x.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                  <span className="flex items-start gap-2"><span aria-hidden className={x.passed ? "text-ok" : "text-bad"}>{x.passed ? "✓" : "✕"}</span>{x.label}</span>
                  <span className="text-right text-xs text-stone">{x.detail}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-stone">Runs after the first apply.</p>}
        </section>

        <section aria-labelledby="issues-h">
          <h2 id="issues-h" className="font-display text-2xl text-ink">Issues in the current version</h2>
          {qa.issues.length === 0 ? <p className="mt-3 text-sm text-stone">No issues found.</p> : (
            <ul className="mt-3 grid gap-2">
              {[...crit, ...warn, ...qa.issues.filter((i) => i.severity === "info")].map((i) => (
                <li key={i.id} className={cx("rounded-[3px] border p-3 text-sm", i.severity === "critical" ? "border-bad/30 bg-bad-soft/40" : i.severity === "warning" ? "border-warn/30 bg-warn-soft/40" : "border-line bg-paper")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={i.severity === "critical" ? "bad" : i.severity === "warning" ? "warn" : "info"}>{i.severity}</Badge>
                    <Badge>{i.category.replace(/_/g, " ")}</Badge>
                    {i.field && <span className="text-xs text-stone">{isFieldPath(i.field) ? FIELDS[i.field].label : i.field}</span>}
                  </div>
                  <p className="mt-1.5 text-ink">{i.message}</p>
                  {i.evidence && <p className="mt-1 text-xs text-stone">Evidence: “{i.evidence}”</p>}
                  <p className="mt-1 text-xs text-charcoal">Suggested: {i.suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {facts && (
        <section aria-labelledby="ledger-h">
          <h2 id="ledger-h" className="font-display text-2xl text-ink">Fact ledger</h2>
          <p className="mt-1 text-sm text-stone">From Agent 03 (rule-based). Verified facts are the only source agents may state as fact. Flags are review prompts, not legal advice.</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line"><tr className="[&>th]:eyebrow [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium [&>th]:text-stone"><th>Fact</th><th>Value</th><th>Status</th></tr></thead>
                <tbody>
                  {facts.facts.map((f) => (
                    <tr key={f.id} className="border-b border-line last:border-0 align-top">
                      <td className="px-4 py-2 text-xs text-stone">{f.label}</td>
                      <td className="px-4 py-2">{f.value}</td>
                      <td className="px-4 py-2"><Badge tone={FACT_TONE[f.status]}>{FACT_LABEL[f.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="grid content-start gap-4">
              <Card className="p-4">
                <h3 className="text-sm font-medium">Claims requiring verification</h3>
                <ul className="mt-2 space-y-2 text-sm">{facts.claimsRequiringVerification.map((x, i) => <li key={i}><span className="text-ink">“{x.claim}”</span><span className="block text-xs text-stone">{x.source} · {x.reason}</span></li>)}</ul>
              </Card>
              <Card className="p-4">
                <h3 className="text-sm font-medium">Risky language in the brief description</h3>
                <ul className="mt-2 space-y-2 text-sm">{facts.riskyLanguage.length ? facts.riskyLanguage.map((x, i) => <li key={i}><Badge tone={x.severity === "critical" ? "bad" : "warn"}>{x.severity}</Badge> <span className="text-ink">“{x.text}”</span><span className="block text-xs text-stone">{x.issue}</span></li>) : <li className="text-stone">None detected.</li>}</ul>
              </Card>
              {facts.imageFlags.length > 0 && (
                <Card className="p-4">
                  <h3 className="text-sm font-medium">Photo flags</h3>
                  <ul className="mt-2 space-y-1 text-sm">{facts.imageFlags.map((x, i) => <li key={i}><span className="font-mono text-xs">{x.imageId}</span> — <span className="text-stone">{x.issue}</span></li>)}</ul>
                </Card>
              )}
              {market && (
                <Card className="p-4">
                  <h3 className="text-sm font-medium">Assumptions (Agent 02 — no research source connected)</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-charcoal">{market.findings.filter((f) => f.basis === "assumption").map((f, i) => <li key={i}>— {f.statement} <Badge tone="info">{f.confidence} confidence</Badge></li>)}</ul>
                </Card>
              )}
            </div>
          </div>
        </section>
      )}

      {qaAgent && (
        <section aria-labelledby="qa-agent-h">
          <h2 id="qa-agent-h" className="font-display text-2xl text-ink">Pre-approval review of drafts</h2>
          <p className="mt-1 text-sm text-stone">Agent 11 (rule-based) — {qaAgent.summary} Scorecard: factual {qaAgent.scorecard.factual}, brand {qaAgent.scorecard.brand}, completeness {qaAgent.scorecard.completeness}.</p>
        </section>
      )}
    </div>
  );
}
