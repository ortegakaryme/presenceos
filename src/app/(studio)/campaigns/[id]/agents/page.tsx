"use client";

import Link from "next/link";
import { useState } from "react";
import { useCampaign } from "@/lib/client/CampaignContext";
import { AGENTS, dependencyWaves } from "@/lib/agents/registry";
import type { AgentId, Run } from "@/lib/domain/schemas";
import { AGENT_LABEL } from "@/lib/builder/conflicts";
import { Badge, ButtonLink, Card, Dot, EmptyState, Button, cx } from "@/components/ui";
import { MODE_LABEL, RUN_STATUS } from "@/components/labels";
import { formatDuration, formatTime } from "@/lib/format";
import { api } from "@/lib/client/api";

const WAVES = dependencyWaves();

export default function AgentsPage() {
  const { campaign: c, running, act, busy } = useCampaign();
  const [runIdx, setRunIdx] = useState<number | null>(null);
  const [selected, setSelected] = useState<AgentId>("facts");
  if (!c.runs.length) {
    return (
      <EmptyState title="Agents have not run yet" action={<Button onClick={() => act("run", () => api(`/api/campaigns/${c.id}/runs`, { body: {} }))} disabled={!!busy}>Run agents</Button>}>
        The baseline version contains only facts from the brief.
      </EmptyState>
    );
  }
  const run: Run = c.runs[runIdx ?? c.runs.length - 1];
  const records = run.agents;
  const rec = records[selected];
  const def = AGENTS[selected];
  const done = Object.values(records).filter((r) => r.status !== "queued" && r.status !== "running").length;
  const runtime = run.completedAt ? Date.parse(run.completedAt) - Date.parse(run.startedAt) : null;
  const proposalsOf = (ids: string[]) => c.proposals.filter((p) => ids.includes(p.id));

  return (
    <div className="grid gap-8">
      <Card className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="eyebrow text-stone">Run</p>
            <div className="mt-1 flex items-center gap-2">
              {c.runs.length > 1 ? (
                <select aria-label="Select run" className="rounded-[3px] border border-line-strong bg-paper px-2 py-1 text-sm" value={runIdx ?? c.runs.length - 1} onChange={(e) => setRunIdx(Number(e.target.value))}>
                  {c.runs.map((r, i) => (
                    <option key={r.id} value={i}>
                      Iteration {r.iteration}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-display text-xl">Iteration {run.iteration}</span>
              )}
              <Badge tone={run.status === "running" ? "info" : run.status === "completed" ? "ok" : "warn"}>{run.status === "running" ? `Running · ${done}/12` : run.status === "completed" ? "Completed" : "Completed with errors"}</Badge>
            </div>
          </div>
          <div>
            <p className="eyebrow text-stone">Execution</p>
            <p className="mt-1 text-sm">{run.mode === "model" ? "Model calls (rule-based agents stay deterministic)" : "Demo mode — simulated agents, no model calls"}</p>
          </div>
          <div>
            <p className="eyebrow text-stone">Started</p>
            <p className="mt-1 text-sm">{formatTime(run.startedAt)}{runtime != null && <span className="text-stone"> · {formatDuration(runtime)}</span>}</p>
          </div>
          {run.feedback && (
            <div className="max-w-md">
              <p className="eyebrow text-stone">Feedback for this iteration</p>
              <p className="mt-1 text-sm italic text-charcoal">“{run.feedback}”</p>
            </div>
          )}
        </div>
        {run.synthesis ? (
          <div className="flex flex-wrap items-center gap-4 md:justify-end">
            <p className="text-sm text-charcoal">
              Builder synthesis: <strong className="font-medium">{run.synthesis.proposalsCreated}</strong> proposals · <strong className="font-medium">{run.synthesis.conflicts}</strong> conflicts · <strong className="font-medium text-bad">{run.synthesis.blocked}</strong> blocked
              {run.synthesis.noOpDiscarded > 0 && <span className="text-stone"> · {run.synthesis.noOpDiscarded} no-op discarded</span>}
            </p>
            <ButtonLink href={`/campaigns/${c.id}/review`} size="sm">Review proposals →</ButtonLink>
          </div>
        ) : (
          running && <p className="text-sm text-stone">Synthesis runs when all agents finish.</p>
        )}
        {run.mode === "demo" && <p className="text-xs text-stone md:col-span-2">Demo mode: each agent is an independent deterministic function of its own inputs and upstream outputs. Agents are paced (DEMO_AGENT_DELAY_MS) so execution states are visible. No language model is called.</p>}
      </Card>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-label="Agent dependency graph">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {WAVES.map((wave, wi) => (
              <div key={wi} className="grid content-start gap-3">
                <p className="eyebrow text-stone">{wi === 0 ? "Parallel discovery" : `Stage ${wi + 1}`}</p>
                {wave.map((id) => {
                  const r = records[id];
                  const s = RUN_STATUS[r.status];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelected(id)}
                      aria-pressed={selected === id}
                      className={cx("rounded-[4px] border bg-paper p-3 text-left transition-colors", selected === id ? "border-ink" : "border-line hover:border-line-strong", r.status === "running" && "border-info/50")}
                    >
                      <div className="flex items-center justify-between">
                        <span className="eyebrow text-taupe">{AGENTS[id].number}</span>
                        <span className="flex items-center gap-1.5 text-[0.7rem] text-stone">
                          <Dot tone={s.tone} pulse={r.status === "running"} />
                          {s.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium leading-snug text-ink">{AGENTS[id].name}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-snug text-stone">{r.status === "running" || r.status === "queued" ? r.task : r.summary ?? r.task}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.65rem] text-stone">{MODE_LABEL[r.executionMode]}</span>
                        {r.attempts > 1 && <Badge tone="warn">{r.attempts} attempts</Badge>}
                        {r.proposalIds.length > 0 && <Badge>{r.proposalIds.length} proposal{r.proposalIds.length === 1 ? "" : "s"}</Badge>}
                        {r.durationMs != null && <span className="text-[0.65rem] text-stone">{formatDuration(r.durationMs)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-stone">Agents in a column have no dependency on each other and start as soon as their own inputs are ready. Specialists only return proposals; the Builder is the only component that updates campaign state.</p>
        </section>

        <Card className="h-fit p-6 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow text-taupe">Agent {def.number}</p>
              <h2 className="font-display mt-1 text-3xl text-ink">{def.name}</h2>
            </div>
            <Badge tone={RUN_STATUS[rec.status].tone}>{RUN_STATUS[rec.status].label}</Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stone">{def.purpose}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
            <div>
              <dt className="eyebrow text-stone">Execution</dt>
              <dd className="mt-1">{MODE_LABEL[rec.executionMode]}{rec.model && <span className="block text-xs text-stone">{rec.model}</span>}</dd>
            </div>
            <div>
              <dt className="eyebrow text-stone">Attempts · duration</dt>
              <dd className="mt-1">{rec.attempts || "—"} · {formatDuration(rec.durationMs)}{rec.usage && <span className="block text-xs text-stone">{rec.usage.inputTokens} in / {rec.usage.outputTokens} out tokens</span>}</dd>
            </div>
            <div className="col-span-2">
              <dt className="eyebrow text-stone">Current task</dt>
              <dd className="mt-1">{rec.reusedFromRunId ? "Not rerun this iteration — reusing its last validated output as context." : rec.task}</dd>
            </div>
            <div className="col-span-2">
              <dt className="eyebrow text-stone">Depends on</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                {def.dependsOn.length ? def.dependsOn.map((d) => (
                  <button key={d} type="button" onClick={() => setSelected(d)} className="flex items-center gap-1.5 rounded-[2px] border border-line px-2 py-0.5 text-xs hover:border-ink">
                    <Dot tone={RUN_STATUS[records[d].status].tone} />
                    {AGENTS[d].number} {AGENT_LABEL[d]}
                  </button>
                )) : <span className="text-stone">None — runs immediately</span>}
              </dd>
            </div>
          </dl>

          {rec.errors.length > 0 && (
            <div className="mt-5 rounded-[3px] border border-bad/30 bg-bad-soft/50 p-3 text-xs leading-relaxed text-bad">
              <p className="mb-1 font-medium">Errors</p>
              <ul className="list-disc space-y-1 pl-4">{rec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              {rec.status === "completed" && <p className="mt-2 text-charcoal">The Builder rejected the malformed output and the retry succeeded.</p>}
            </div>
          )}

          {rec.summary && (
            <div className="mt-5">
              <p className="eyebrow text-stone">Output summary</p>
              <p className="mt-1.5 text-sm text-ink">{rec.summary}</p>
              {rec.rationale && <p className="mt-2 text-sm leading-relaxed text-charcoal"><span className="text-stone">Rationale: </span>{rec.rationale}</p>}
            </div>
          )}

          {rec.warnings.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow text-stone">Warnings</p>
              <ul className="mt-1.5 space-y-1 text-sm text-warn">{rec.warnings.map((w, i) => <li key={i}>— {w}</li>)}</ul>
            </div>
          )}

          <div className="mt-5">
            <p className="eyebrow text-stone">Acceptance criteria</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {def.acceptanceCriteria.map((cr) => {
                const r = rec.acceptance.find((a) => a.criterion === cr);
                return (
                  <li key={cr} className="flex items-start gap-2">
                    <span aria-hidden className={cx("mt-0.5 text-xs", r ? (r.passed ? "text-ok" : "text-bad") : "text-stone")}>{r ? (r.passed ? "✓" : "✕") : "○"}</span>
                    <span className={r ? "text-charcoal" : "text-stone"}>
                      {cr}
                      {r?.detail && <span className="text-stone"> · {r.detail}</span>}
                      <span className="sr-only">{r ? (r.passed ? " — passed" : " — failed") : " — not evaluated yet"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {rec.proposalIds.length > 0 && (
            <div className="mt-5">
              <p className="eyebrow text-stone">Proposed changes</p>
              <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
                {proposalsOf(rec.proposalIds).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate">{p.field}</span>
                    <Badge tone={p.validation.status === "blocked" ? "bad" : p.validation.status === "warning" ? "warn" : "ok"}>{p.validation.status}</Badge>
                  </li>
                ))}
              </ul>
              <Link href={`/campaigns/${c.id}/review`} className="mt-2 inline-block text-xs underline underline-offset-2">Open in review queue</Link>
            </div>
          )}

          {rec.output != null && (
            <details className="mt-5 rounded-[3px] border border-line">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-charcoal">Full structured output (validated)</summary>
              <pre className="max-h-96 overflow-auto border-t border-line bg-ivory p-3 text-[0.7rem] leading-relaxed text-charcoal">{JSON.stringify(rec.output, null, 2)}</pre>
            </details>
          )}
          <p className="mt-4 text-[0.7rem] leading-relaxed text-stone">Rationales are concise summaries with evidence, not hidden reasoning transcripts.</p>
        </Card>
      </div>
    </div>
  );
}
