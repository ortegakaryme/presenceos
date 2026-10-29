"use client";

import { useState } from "react";
import type { FieldValue, Proposal } from "@/lib/domain/schemas";
import { fieldSpec } from "@/lib/domain/fields";
import { AGENT_LABEL } from "@/lib/builder/conflicts";
import { useCampaign } from "@/lib/client/CampaignContext";
import { api } from "@/lib/client/api";
import { Badge, Button, cx, inputClass, type Tone } from "./ui";
import { ValueEditor, ValueView } from "./values";

const VAL_TONE: Record<Proposal["validation"]["status"], Tone> = { passed: "ok", warning: "warn", blocked: "bad" };
const STATUS_TONE: Record<Proposal["status"], Tone> = { pending: "neutral", approved: "ok", rejected: "bad", superseded: "neutral", applied: "dark", auto_rejected: "bad", stale: "neutral" };
const STATUS_LABEL: Record<Proposal["status"], string> = { pending: "Pending", approved: "Approved · not applied", rejected: "Rejected", superseded: "Superseded", applied: "Applied", auto_rejected: "Rejected by Builder", stale: "Stale" };

export function ProposalCard({ p, recommended, recommendationReason, showCurrent = true }: { p: Proposal; recommended?: boolean; recommendationReason?: string; showCurrent?: boolean }) {
  const { campaign: c, act, busy } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const spec = fieldSpec(p.field);
  const value = p.editedValue ?? p.proposedValue;
  const decide = (action: "approve" | "reject" | "reset" | "edit", editedValue?: FieldValue) =>
    act(`${p.id}:${action}`, () => api(`/api/campaigns/${c.id}/proposals/${p.id}`, { body: { action, editedValue, note: note || undefined } }));
  const blocked = p.validation.status === "blocked";
  const isBusy = !!busy?.startsWith(p.id);
  const latestRun = c.runs[c.runs.length - 1];
  const canReset = (p.status === "approved" || p.status === "rejected") && (p.runId === latestRun?.id || p.runId === "manual");

  return (
    <article className={cx("rounded-[4px] border bg-paper", recommended ? "border-ink/60" : "border-line")} aria-labelledby={`${p.id}-title`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow text-taupe">{spec.component}</p>
          <h3 id={`${p.id}-title`} className="mt-0.5 text-sm font-medium text-ink">{spec.label}</h3>
          <p className="mt-0.5 text-xs text-stone">
            {AGENT_LABEL[p.agentId]} · <span className="font-mono">{p.id}</span> · iteration {p.iteration}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {recommended && <Badge tone="dark">Builder recommends</Badge>}
          {p.correctsProposalId && <Badge tone="info">QA correction</Badge>}
          {p.editedValue !== undefined && <Badge tone="info">Edited</Badge>}
          <Badge tone={VAL_TONE[p.validation.status]} title="Builder validation">Validation: {p.validation.status}</Badge>
          <Badge tone={p.risk === "critical" ? "bad" : p.risk === "high" ? "warn" : "neutral"}>Risk: {p.risk}</Badge>
          <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
        </div>
      </header>
      <div className={cx("grid gap-4 px-4 py-4", showCurrent && "md:grid-cols-2")}>
        {showCurrent && (
          <div>
            <p className="eyebrow mb-2 text-stone">Current (v{c.currentVersion})</p>
            <ValueView field={p.field} value={p.currentValue} brief={c.brief} compact />
          </div>
        )}
        <div>
          <p className="eyebrow mb-2 text-stone">{p.editedValue !== undefined ? "Proposed · with your edits" : "Proposed"}</p>
          {editing ? (
            <ValueEditor field={p.field} initial={value} brief={c.brief} busy={isBusy} onCancel={() => setEditing(false)} onSave={async (v) => { await decide("edit", v); setEditing(false); }} saveLabel="Save & revalidate" />
          ) : (
            <ValueView field={p.field} value={value} brief={c.brief} />
          )}
        </div>
      </div>
      <div className="grid gap-3 border-t border-line px-4 py-3 text-xs">
        <p className="leading-relaxed text-charcoal"><span className="text-stone">Why: </span>{p.rationale}</p>
        {recommendationReason && <p className="leading-relaxed text-charcoal"><span className="text-stone">Builder: </span>{recommendationReason}</p>}
        {p.evidence.length > 0 && (
          <p className="leading-relaxed text-stone">Evidence: {p.evidence.join(" · ")}</p>
        )}
        {p.validation.issues.length > 0 && (
          <ul className="grid gap-1.5">
            {p.validation.issues.map((i, k) => (
              <li key={k} className={cx("rounded-[3px] px-2.5 py-1.5", i.severity === "critical" ? "bg-bad-soft text-bad" : i.severity === "warning" ? "bg-warn-soft text-warn" : "bg-info-soft text-info")}>
                <span className="font-medium uppercase tracking-wide">{i.severity}</span> · {i.message}
                {i.evidence && <span className="block text-charcoal/80">“{i.evidence}”</span>}
              </li>
            ))}
          </ul>
        )}
        {p.decisionNote && <p className="text-stone">Note: {p.decisionNote}</p>}
      </div>
      {(p.status === "pending" || canReset) && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {p.status === "pending" && (
            <>
              <Button size="sm" disabled={blocked || isBusy} onClick={() => decide("approve")} title={blocked ? "Resolve critical issues first (edit the proposal)" : undefined}>
                {p.editedValue !== undefined ? "Approve with edits" : "Approve"}
              </Button>
              <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => setEditing((e) => !e)}>{editing ? "Close editor" : "Edit"}</Button>
              <Button size="sm" variant="danger" disabled={isBusy} onClick={() => decide("reject")}>Reject</Button>
              <input aria-label="Decision note (optional)" placeholder="Note (optional)" className={cx(inputClass, "h-8 max-w-xs flex-1 py-1 text-xs")} value={note} onChange={(e) => setNote(e.target.value)} />
              {blocked && <span className="text-xs text-bad">Blocked: edit to resolve critical issues before approving.</span>}
            </>
          )}
          {canReset && p.status !== "pending" && (
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => decide("reset")}>Undo decision</Button>
          )}
        </footer>
      )}
    </article>
  );
}
