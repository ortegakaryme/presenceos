"use client";

import { useState } from "react";
import { useCampaign } from "@/lib/client/CampaignContext";
import { FIELDS, FIELD_PATHS, getField, valuesEqual, valueToText } from "@/lib/domain/fields";
import { AGENT_LABEL } from "@/lib/builder/conflicts";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, cx, inputClass } from "@/components/ui";
import { ValueView } from "@/components/values";
import { formatTime, truncate } from "@/lib/format";

export default function HistoryPage() {
  const { campaign: c, act, busy, running } = useCampaign();
  const versions = [...c.versions].reverse();
  const [a, setA] = useState<number>(Math.max(1, c.currentVersion - 1));
  const [b, setB] = useState<number>(c.currentVersion);
  const va = c.versions.find((v) => v.number === a);
  const vb = c.versions.find((v) => v.number === b);
  const diff = va && vb ? FIELD_PATHS.filter((f) => !valuesEqual(getField(va.content, f), getField(vb.content, f))) : [];

  return (
    <div className="grid gap-10">
      <section className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div>
          <h2 className="font-display text-2xl text-ink">Versions</h2>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {versions.map((v) => (
              <li key={v.number} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-ink">
                    v{v.number} · {v.label}
                    {v.number === c.currentVersion && <Badge tone="dark" className="ml-2">Current</Badge>}
                    {c.approval?.version === v.number && <Badge tone="ok" className="ml-1">Approved</Badge>}
                  </p>
                  <p className="text-xs text-stone">{formatTime(v.createdAt)} · {v.source}{v.restoredFrom ? ` from v${v.restoredFrom}` : ""}</p>
                </div>
                <div className="flex gap-1">
                  <a href={`/p/${c.id}?v=${v.number}`} target="_blank" rel="noreferrer" className="px-2 text-xs underline underline-offset-2">View</a>
                  {v.number !== c.currentVersion && (
                    <Button size="sm" variant="ghost" disabled={!!busy || running} onClick={() => act(`restore:${v.number}`, () => api(`/api/campaigns/${c.id}/restore`, { body: { version: v.number } }))}>
                      Restore
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-stone">Restoring creates a new version; no history is deleted.</p>
        </div>
        <div>
          <div className="flex flex-wrap items-end gap-3">
            <h2 className="font-display mr-auto text-2xl text-ink">Compare</h2>
            {[["From", a, setA], ["To", b, setB]].map(([label, val, set]) => (
              <label key={label as string} className="flex items-center gap-2 text-xs text-stone">
                {label as string}
                <select className={cx(inputClass, "w-24 py-1")} value={val as number} onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}>
                  {c.versions.map((v) => <option key={v.number} value={v.number}>v{v.number}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-stone">{diff.length} field{diff.length === 1 ? "" : "s"} differ between v{a} and v{b}.</p>
          <div className="mt-4 grid gap-3">
            {va && vb && diff.map((f) => (
              <Card key={f} className="p-4">
                <p className="text-sm font-medium text-ink">{FIELDS[f].label} <span className="text-xs font-normal text-stone">· {FIELDS[f].component}</span></p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="rounded-[3px] bg-bad-soft/30 p-3"><p className="eyebrow mb-1.5 text-stone">v{a}</p><ValueView field={f} value={getField(va.content, f)} brief={c.brief} compact /></div>
                  <div className="rounded-[3px] bg-ok-soft/40 p-3"><p className="eyebrow mb-1.5 text-stone">v{b}</p><ValueView field={f} value={getField(vb.content, f)} brief={c.brief} compact /></div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="log-h">
        <h2 id="log-h" className="font-display text-2xl text-ink">Changelog</h2>
        <p className="mt-1 text-sm text-stone">Every applied change: when, which version, who proposed it, old and new value, rationale and approval.</p>
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-line"><tr className="[&>th]:eyebrow [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium [&>th]:text-stone"><th>Time</th><th>Ver.</th><th>Field</th><th>Proposed by</th><th>Change</th><th>Rationale</th><th>Approval</th></tr></thead>
            <tbody>
              {[...c.changelog].reverse().map((l) => (
                <tr key={l.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-stone">{formatTime(l.timestamp)}</td>
                  <td className="px-4 py-2.5">v{l.version}</td>
                  <td className="px-4 py-2.5 text-xs">{FIELDS[l.field as keyof typeof FIELDS]?.label ?? l.field}{l.changeId && <span className="block font-mono text-[0.65rem] text-stone">{l.changeId}</span>}</td>
                  <td className="px-4 py-2.5 text-xs">{AGENT_LABEL[l.author]}</td>
                  <td className="max-w-xs px-4 py-2.5 text-xs">
                    <span className="block text-stone line-through decoration-stone/50">{truncate(valueToText(l.oldValue) || "—", 90)}</span>
                    <span className="block text-ink">{truncate(valueToText(l.newValue) || "—", 120)}</span>
                  </td>
                  <td className="max-w-xs px-4 py-2.5 text-xs text-charcoal">{truncate(l.rationale, 160)}</td>
                  <td className="px-4 py-2.5"><Badge tone={l.approval === "baseline" ? "neutral" : l.approval === "restored" || l.approval === "example_seed" ? "info" : "ok"} title={l.approval === "example_seed" ? "Pre-applied by the example seed, not by a person" : undefined}>{l.approval === "example_seed" ? "seeded (not a human)" : l.approval.replace(/_/g, " ")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
