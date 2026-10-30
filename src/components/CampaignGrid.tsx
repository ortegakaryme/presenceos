"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CampaignSummary } from "@/lib/domain/summary";
import { summarize } from "@/lib/domain/summary";
import { listLocalCampaigns, useLocalRevision } from "@/lib/client/localStore";
import type { StorageMode } from "@/lib/client/mode";
import { formatPrice } from "@/lib/format";
import { Badge, ButtonLink, EmptyState, type Tone } from "./ui";
import { SafeImage } from "./SafeImage";
import { DeleteCampaignButton } from "./CampaignActions";

const STAGE_TONE: Record<string, Tone> = { intake: "neutral", running: "info", review: "warn", blocked: "bad", ready: "ok", approved: "dark" };

/** Campaign cards. In browser-storage mode, this visitor's campaigns (and edited examples) are merged in. */
export function CampaignGrid({ initial, mode }: { initial: CampaignSummary[]; mode: StorageMode }) {
  const rev = useLocalRevision();
  const [removed, setRemoved] = useState<string[]>([]);
  const items = useMemo(() => {
    const byId = new Map(initial.map((s) => [s.id, s]));
    if (mode === "browser" && rev !== null) for (const c of listLocalCampaigns()) byId.set(c.id, summarize(c));
    return [...byId.values()].filter((s) => !removed.includes(s.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [initial, mode, rev, removed]);

  if (items.length === 0) {
    return <EmptyState title="No campaigns" action={<ButtonLink href="/campaigns/new" variant="secondary">Start a new brief</ButtonLink>} />;
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => (
        <li key={c.id} className="group flex flex-col overflow-hidden rounded-[4px] border border-line bg-paper">
          <Link href={`/campaigns/${c.id}`} className="relative block overflow-hidden" tabIndex={-1} aria-hidden>
            <SafeImage src={c.heroUrl} alt="" caption={c.heroCaption} sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="aspect-[16/10] w-full transition-transform duration-700 group-hover:scale-[1.02]" />
            {c.origin === "example" && <span className="eyebrow absolute left-3 top-3 bg-paper/90 px-2 py-1 text-[0.6rem] text-umber">Example</span>}
          </Link>
          <div className="flex flex-1 flex-col p-5">
            <p className="eyebrow text-taupe">{c.neighborhood} · {c.city}</p>
            <Link href={`/campaigns/${c.id}`} className="font-display mt-1 text-2xl text-ink hover:underline">{c.name}</Link>
            <p className="mt-0.5 text-sm text-stone">{formatPrice(c.price.amount, c.price.currency)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-stone">
              <Badge tone={STAGE_TONE[c.stage]}>{c.stageLabel}</Badge>
              <span>v{c.version}</span>
              <span aria-hidden>·</span>
              <span>{c.pending ? `${c.pending} to review` : "nothing to review"}</span>
              {c.critical > 0 && <><span aria-hidden>·</span><span className="text-bad">{c.critical} critical</span></>}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
              <ButtonLink href={`/campaigns/${c.id}/${c.pending ? "review" : "studio"}`} size="sm">{c.pending ? "Review" : "Open"}</ButtonLink>
              <a href={`/p/${c.id}`} target="_blank" rel="noreferrer" className="px-2 text-xs underline underline-offset-2">Live page ↗</a>
              {c.origin !== "example" && (
                <span className="ml-auto">
                  <DeleteCampaignButton id={c.id} name={c.name} onDeleted={() => setRemoved((r) => [...r, c.id])} />
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
