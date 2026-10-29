"use client";

import Link from "next/link";
import { useState } from "react";
import { useCampaign } from "@/lib/client/CampaignContext";
import { FIELDS, isFieldPath, type Component } from "@/lib/domain/fields";
import type { Proposal } from "@/lib/domain/schemas";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, EmptyState, Notice, cx } from "@/components/ui";
import { ProposalCard } from "@/components/ProposalCard";
import { IterationPanel } from "@/components/IterationPanel";

const ORDER: Component[] = ["Positioning", "Brand", "Landing page", "Listing", "Social", "Video", "SEO"];
type Tab = "pending" | "approved" | "archive";

export default function ReviewPage() {
  const { campaign: c, act, busy, running } = useCampaign();
  const [tab, setTab] = useState<Tab>("pending");
  const by = (s: Proposal["status"][]) => c.proposals.filter((p) => s.includes(p.status));
  const pending = by(["pending"]);
  const approved = by(["approved"]);
  const archive = by(["rejected", "superseded", "applied", "auto_rejected", "stale"]).reverse();
  const openConflicts = c.conflicts.filter((k) => k.status === "open");
  const inOpenConflict = new Set(openConflicts.flatMap((k) => k.proposalIds));
  const list = tab === "pending" ? pending.filter((p) => !inOpenConflict.has(p.id)) : tab === "approved" ? approved : archive;
  const grouped = ORDER.map((comp) => ({ comp, items: list.filter((p) => isFieldPath(p.field) && FIELDS[p.field].component === comp) })).filter((g) => g.items.length);
  const bulkEligible = pending.filter((p) => p.validation.status === "passed" && (!p.conflictId || c.conflicts.find((k) => k.id === p.conflictId)?.recommendation.proposalId === p.id)).length;

  return (
    <div className="grid gap-8">
      {running && <Notice tone="info" title="Agents are running">Proposals appear here when the Builder finishes synthesis.</Notice>}

      <div className="sticky top-14 z-20 -mx-4 border-b border-line bg-ivory/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-[4px] md:border md:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-charcoal">
            <strong className="font-medium">{pending.length}</strong> to review · <strong className="font-medium">{openConflicts.length}</strong> open conflicts · <strong className="font-medium text-ok">{approved.length}</strong> approved, not yet applied
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!bulkEligible || !!busy || running} onClick={() => act("bulk", () => api(`/api/campaigns/${c.id}/approve-recommended`, { body: {} }))} title="Approves only proposals that passed validation with no warnings, choosing the Builder's recommendation in conflicts.">
              Approve {bulkEligible} recommended (passed validation)
            </Button>
            <Button size="sm" disabled={!approved.length || !!busy || running} onClick={async () => { const r = await act("apply", () => api(`/api/campaigns/${c.id}/apply`, { body: {} })); if (r) setTab("pending"); }}>
              {busy === "apply" ? "Applying…" : `Apply ${approved.length} approved → v${c.currentVersion + 1}`}
            </Button>
          </div>
        </div>
      </div>

      {tab === "pending" && openConflicts.length > 0 && (
        <section aria-labelledby="conflicts-h" className="grid gap-5">
          <div>
            <h2 id="conflicts-h" className="font-display text-3xl text-ink">Conflicts</h2>
            <p className="mt-1 text-sm text-stone">Agents disagree on these fields. The Builder recommends an option and explains the trade-off; the decision is yours.</p>
          </div>
          {openConflicts.map((k) => {
            const opts = c.proposals.filter((p) => k.proposalIds.includes(p.id) && p.status === "pending");
            return (
              <Card key={k.id} className="p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">Conflict</Badge>
                  <h3 className="text-sm font-medium text-ink">{isFieldPath(k.field) ? FIELDS[k.field].label : k.field}</h3>
                  <span className="font-mono text-[0.7rem] text-stone">{k.id}</span>
                </div>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-charcoal"><span className="text-stone">Trade-off: </span>{k.tradeoff}</p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {opts.map((p) => (
                    <ProposalCard key={p.id} p={p} showCurrent={false} recommended={k.recommendation.proposalId === p.id} recommendationReason={k.recommendation.proposalId === p.id ? k.recommendation.reason : undefined} />
                  ))}
                </div>
              </Card>
            );
          })}
        </section>
      )}

      <section className="grid gap-5">
        <div role="tablist" aria-label="Proposal status" className="flex gap-1 border-b border-line">
          {([["pending", `Pending (${pending.length - [...inOpenConflict].filter((id) => pending.some((p) => p.id === id)).length})`], ["approved", `Approved (${approved.length})`], ["archive", `Decided & archived (${archive.length})`]] as [Tab, string][]).map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 px-3 pb-2.5 text-sm", tab === t ? "border-ink text-ink" : "border-transparent text-stone hover:text-ink")}>
              {l}
            </button>
          ))}
        </div>
        {grouped.length === 0 ? (
          <EmptyState title={tab === "pending" ? (c.runs.length ? "Nothing left to review" : "No proposals yet") : tab === "approved" ? "No approved changes waiting" : "No decisions yet"}>
            {tab === "pending" && approved.length > 0 ? "Apply your approved changes to create a new version." : tab === "pending" ? <>Request another iteration below, or check <Link className="underline" href={`/campaigns/${c.id}/qa`}>Quality</Link>.</> : null}
          </EmptyState>
        ) : (
          grouped.map((g) => (
            <div key={g.comp} className="grid gap-3">
              <h3 className="eyebrow text-taupe">{g.comp}</h3>
              {g.items.map((p) => <ProposalCard key={p.id} p={p} />)}
            </div>
          ))
        )}
      </section>

      <IterationPanel />
    </div>
  );
}
