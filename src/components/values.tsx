"use client";

import { useState } from "react";
import type { Feature, FieldValue, PropertyBrief, SectionKey, VideoScene } from "@/lib/domain/schemas";
import { SECTION_KEYS } from "@/lib/domain/schemas";
import { fieldSpec } from "@/lib/domain/fields";
import { SafeImage } from "./SafeImage";
import { Button, inputClass, cx } from "./ui";

const SECTION_NAME: Record<SectionKey, string> = { facts: "Key facts", story: "Story", gallery: "Gallery", features: "Features", amenities: "Amenities", location: "Location", inquiry: "Inquiry" };

export function ValueView({ field, value, brief, compact }: { field: string; value: FieldValue | null | undefined; brief: PropertyBrief; compact?: boolean }) {
  const kind = fieldSpec(field).kind;
  const empty = value == null || (typeof value === "string" ? !value.trim() : value.length === 0);
  if (empty) return <p className="text-sm italic text-stone">Empty</p>;
  const img = (id: string) => brief.images.find((i) => i.id === id);
  switch (kind) {
    case "text":
    case "longtext":
      return <p className={cx("whitespace-pre-line text-sm leading-relaxed text-ink", compact && "line-clamp-4")}>{value as string}</p>;
    case "list":
      return (
        <ul className="space-y-1 text-sm text-ink">
          {(value as string[]).map((v, i) => <li key={i} className="flex gap-2"><span className="text-taupe">—</span>{v}</li>)}
        </ul>
      );
    case "paragraphs":
      return <div className={cx("space-y-2 text-sm leading-relaxed text-ink", compact && "line-clamp-6")}>{(value as string[]).map((v, i) => <p key={i}>{v}</p>)}</div>;
    case "features":
      return (
        <dl className="grid gap-2 text-sm">
          {(value as Feature[]).map((f, i) => (
            <div key={i}>
              <dt className="font-medium text-ink">{f.title}</dt>
              <dd className="text-stone">{f.body}</dd>
            </div>
          ))}
        </dl>
      );
    case "scenes":
      return (
        <ol className="grid gap-2 text-xs">
          {(value as VideoScene[]).map((s, i) => (
            <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-2 border-b border-line pb-2 last:border-0">
              <span className="font-mono text-stone">{s.timecode}</span>
              <span>
                <span className="block text-ink">{s.voiceover}</span>
                <span className="block text-stone">Shot: {s.shot} · On screen: “{s.onScreen}”</span>
              </span>
            </li>
          ))}
        </ol>
      );
    case "image": {
      const i = img(value as string);
      return (
        <figure className="flex items-center gap-3">
          <SafeImage src={i?.url} alt={i?.caption ?? String(value)} caption="—" className="aspect-[4/3] w-28 rounded-[2px]" />
          <figcaption className="text-xs text-stone">{i?.caption ?? `Unknown image ${value}`}</figcaption>
        </figure>
      );
    }
    case "images":
      return (
        <ul className="flex flex-wrap gap-2">
          {(value as string[]).map((id) => {
            const i = img(id);
            return (
              <li key={id} className="w-24">
                <SafeImage src={i?.url} alt={i?.caption ?? id} caption="—" className="aspect-[4/3] w-24 rounded-[2px]" />
                <p className="mt-1 line-clamp-2 text-[0.65rem] leading-tight text-stone">{i?.caption ?? id}</p>
              </li>
            );
          })}
        </ul>
      );
    case "sections":
      return <p className="text-sm text-ink">{(value as SectionKey[]).map((s) => SECTION_NAME[s] ?? s).join("  →  ")}</p>;
  }
}

/** Kind-aware editor. Calls onSave with a typed value. */
export function ValueEditor({ field, initial, brief, onSave, onCancel, saveLabel = "Save edit", busy }: { field: string; initial: FieldValue; brief: PropertyBrief; onSave: (v: FieldValue) => void; onCancel: () => void; saveLabel?: string; busy?: boolean }) {
  const kind = fieldSpec(field).kind;
  const spec = fieldSpec(field);
  const [text, setText] = useState(() =>
    kind === "list" ? (initial as string[]).join("\n") : kind === "paragraphs" ? (initial as string[]).join("\n\n") : typeof initial === "string" ? initial : "",
  );
  const [rows, setRows] = useState<Feature[] | VideoScene[]>(() => (kind === "features" || kind === "scenes" ? structuredClone(initial as Feature[]) : []));
  const [ids, setIds] = useState<string[]>(() => (kind === "images" || kind === "sections" ? [...(initial as string[])] : []));
  const [single, setSingle] = useState(() => (kind === "image" ? (initial as string) : ""));
  const id = `edit-${field}`;

  const value = (): FieldValue => {
    switch (kind) {
      case "list": return text.split("\n").map((s) => s.trim()).filter(Boolean);
      case "paragraphs": return text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      case "features":
      case "scenes": return rows;
      case "images":
      case "sections": return ids;
      case "image": return single;
      default: return text;
    }
  };
  const move = (i: number, d: -1 | 1) => setIds((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });

  return (
    <div className="grid gap-3 rounded-[3px] border border-line-strong bg-ivory p-3">
      <label htmlFor={id} className="eyebrow text-stone">Edit {spec.label.toLowerCase()}</label>
      {(kind === "text" || kind === "longtext" || kind === "list" || kind === "paragraphs") &&
        (kind === "text" ? (
          <input id={id} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <textarea id={id} rows={kind === "longtext" ? 5 : 7} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
        ))}
      {kind === "list" && <p className="text-xs text-stone">One item per line.</p>}
      {kind === "paragraphs" && <p className="text-xs text-stone">Separate paragraphs with a blank line.</p>}
      {"maxLength" in spec && spec.maxLength && (kind === "text" || kind === "longtext") && (
        <p className={cx("text-xs", text.length > spec.maxLength ? "text-bad" : "text-stone")}>{text.length} / {spec.maxLength}</p>
      )}
      {(kind === "features" || kind === "scenes") && (
        <div className="grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-[3px] border border-line bg-paper p-2 sm:grid-cols-[1fr_auto]">
              <div className="grid gap-2">
                {Object.keys(r).map((k) => (
                  <input key={k} aria-label={`${k} ${i + 1}`} placeholder={k} className={cx(inputClass, "py-1.5 text-xs")} value={(r as unknown as Record<string, string>)[k]} onChange={(e) => setRows((all) => all.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) as Feature[] | VideoScene[])} />
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((_, j) => j !== i) as Feature[] | VideoScene[])}>Remove</Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" className="justify-self-start" onClick={() => setRows((all) => [...all, kind === "features" ? { title: "", body: "" } : { timecode: "", shot: "", voiceover: "", onScreen: "" }] as Feature[] | VideoScene[])}>
            Add {kind === "features" ? "feature" : "scene"}
          </Button>
        </div>
      )}
      {kind === "image" && (
        <select id={id} className={inputClass} value={single} onChange={(e) => setSingle(e.target.value)}>
          {brief.images.map((i) => <option key={i.id} value={i.id}>{i.caption}</option>)}
        </select>
      )}
      {(kind === "images" || kind === "sections") && (
        <div className="grid gap-1.5">
          <ol className="grid gap-1">
            {ids.map((x, i) => (
              <li key={x} className="flex items-center gap-2 rounded-[3px] border border-line bg-paper px-2 py-1 text-xs">
                <span className="w-5 text-stone">{i + 1}.</span>
                <span className="flex-1 truncate">{kind === "sections" ? SECTION_NAME[x as SectionKey] : brief.images.find((im) => im.id === x)?.caption ?? x}</span>
                <button type="button" aria-label="Move up" className="px-1 text-stone hover:text-ink" onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label="Move down" className="px-1 text-stone hover:text-ink" onClick={() => move(i, 1)}>↓</button>
                <button type="button" aria-label="Remove" className="px-1 text-stone hover:text-bad" onClick={() => setIds((a) => a.filter((y) => y !== x))}>✕</button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5">
            {(kind === "sections" ? [...SECTION_KEYS] : brief.images.map((i) => i.id)).filter((x) => !ids.includes(x)).map((x) => (
              <button key={x} type="button" className="rounded-[2px] border border-dashed border-line-strong px-2 py-0.5 text-[0.7rem] text-stone hover:border-ink hover:text-ink" onClick={() => setIds((a) => [...a, x])}>
                + {kind === "sections" ? SECTION_NAME[x as SectionKey] : brief.images.find((im) => im.id === x)?.caption}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSave(value())}>{saveLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
