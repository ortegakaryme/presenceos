"use client";

import { useState } from "react";
import { useCampaign } from "@/lib/client/CampaignContext";
import { FIELDS, FIELD_PATHS, getField, type Component, type FieldPath } from "@/lib/domain/fields";
import { AGENT_LABEL } from "@/lib/builder/conflicts";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, cx } from "@/components/ui";
import { ValueEditor, ValueView } from "@/components/values";

const ORDER: Component[] = ["Landing page", "Listing", "Social", "Video", "SEO", "Brand", "Positioning"];

export default function StudioPage() {
  const { campaign: c, act, busy } = useCampaign();
  const [comp, setComp] = useState<Component>("Landing page");
  const [editing, setEditing] = useState<FieldPath | null>(null);
  const [view, setView] = useState<"live" | "draft">("draft");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const content = c.versions.find((v) => v.number === c.currentVersion)!.content;
  const fields = FIELD_PATHS.filter((f) => FIELDS[f].component === comp && (!f.startsWith("social.") || c.brief.channels.includes(f.split(".")[1] as never)));
  const lastChange = (f: string) => [...c.changelog].reverse().find((l) => l.field === f);
  const pendingFor = (f: string) => c.proposals.filter((p) => p.field === f && (p.status === "pending" || p.status === "approved"));
  const src = `/p/${c.id}?embed=1${view === "draft" ? "&view=draft" : ""}`;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section aria-label="Content workspace" className="grid content-start gap-5">
        <div>
          <h2 className="font-display text-3xl text-ink">Content workspace</h2>
          <p className="mt-1 text-sm text-stone">Current approved content (v{c.currentVersion}) with its provenance. Your edits become proposals that are validated and applied like any agent change.</p>
        </div>
        <div role="tablist" aria-label="Asset type" className="flex flex-wrap gap-1">
          {ORDER.map((o) => (
            <button key={o} role="tab" aria-selected={comp === o} onClick={() => setComp(o)} className={cx("rounded-[3px] px-3 py-1.5 text-xs", comp === o ? "bg-ink text-paper" : "bg-sand/60 text-charcoal hover:bg-sand")}>
              {o}
            </button>
          ))}
        </div>
        {fields.map((f) => {
          const lc = lastChange(f);
          const pend = pendingFor(f);
          return (
            <Card key={f} className="p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-ink">{FIELDS[f].label}{FIELDS[f].required && <span className="text-taupe"> *</span>}</h3>
                  <p className="mt-0.5 text-[0.7rem] text-stone">
                    {lc ? `${lc.approval === "baseline" ? "Baseline" : AGENT_LABEL[lc.author]} · v${lc.version} · ${lc.approval.replace(/_/g, " ")}` : "Not set"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pend.length > 0 && <Badge tone="warn">{pend.length} in review</Badge>}
                  {editing !== f && <Button size="sm" variant="secondary" onClick={() => setEditing(f)}>Edit</Button>}
                </div>
              </div>
              {editing === f ? (
                <ValueEditor
                  field={f}
                  initial={getField(content, f)}
                  brief={c.brief}
                  busy={busy === `edit:${f}`}
                  saveLabel="Submit edit for apply"
                  onCancel={() => setEditing(null)}
                  onSave={async (value) => {
                    const r = await act(`edit:${f}`, () => api(`/api/campaigns/${c.id}/proposals`, { body: { field: f, value } }));
                    if (r) setEditing(null);
                  }}
                />
              ) : (
                <ValueView field={f} value={getField(content, f)} brief={c.brief} />
              )}
            </Card>
          );
        })}
        <p className="text-xs text-stone">Edits that pass validation are approved immediately (you authored them) and wait in the Review queue for Apply. Edits with critical issues stay pending until fixed.</p>
      </section>

      <section aria-label="Page preview" className="grid content-start gap-3 xl:sticky xl:top-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Preview content" className="flex rounded-[3px] border border-line-strong p-0.5 text-xs">
            {(["draft", "live"] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cx("rounded-[2px] px-3 py-1", view === v ? "bg-ink text-paper" : "text-charcoal")}>
                {v === "draft" ? "Draft (with pending)" : `Live (v${c.currentVersion})`}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Device" className="flex rounded-[3px] border border-line-strong p-0.5 text-xs">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} aria-pressed={device === d} onClick={() => setDevice(d)} className={cx("rounded-[2px] px-3 py-1 capitalize", device === d ? "bg-ink text-paper" : "text-charcoal")}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-[4px] border border-line bg-sand/40">
          <iframe key={`${src}-${c.updatedAt}`} title="Property page preview" src={src} className={cx("mx-auto block h-[78vh] bg-ivory", device === "mobile" ? "w-[390px] max-w-full border-x border-line" : "w-full")} />
        </div>
        <p className="text-xs text-stone">{view === "draft" ? "Draft overlays approved and pending proposals (Builder recommendation where agents conflict; blocked proposals excluded). It is never published." : "Exactly what the public page shows."}</p>
      </section>
    </div>
  );
}
