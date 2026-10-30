"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Campaign, CampaignContent, PropertyBrief } from "@/lib/domain/schemas";
import { getLocalCampaign, useLocalRevision } from "@/lib/client/localStore";
import type { StorageMode } from "@/lib/client/mode";
import { publicView } from "@/lib/builder/view";
import { PropertyPage } from "./PropertyPage";
import { PreviewTracker } from "../PreviewTracker";

interface Rendered {
  brief: PropertyBrief;
  content: CampaignContent;
  label: string;
  showBanner: boolean;
}

/**
 * Public property page. Server-rendered from the server copy; in browser-storage mode this
 * browser's own copy (its campaigns, or examples it changed) replaces it after load.
 */
export function PublicProperty({ id, view, v, embed, mode, initial }: { id: string; view?: string; v?: string; embed: boolean; mode: StorageMode; initial: Rendered | null }) {
  const rev = useLocalRevision();
  const checked = mode === "server" || rev !== null;
  const shown = useMemo<Rendered | null>(() => {
    if (mode !== "browser" || rev === null) return initial;
    const local: Campaign | null = getLocalCampaign(id);
    const r = local ? publicView(local, view, v) : null;
    return r && local ? { brief: local.brief, ...r } : initial;
  }, [mode, rev, id, view, v, initial]);

  if (!shown) {
    if (!checked) return <p className="px-6 py-20 text-center text-sm text-stone">Loading…</p>;
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
        <p className="eyebrow text-taupe">Not found</p>
        <h1 className="font-display mt-2 text-4xl">This page isn’t available</h1>
        <p className="mt-2 text-sm text-stone">Campaigns created on this demo are saved in the browser that created them.</p>
        <Link href="/" className="mt-6 text-sm underline underline-offset-4">Back to overview</Link>
      </div>
    );
  }
  return (
    <>
      <PreviewTracker campaignId={id} view={view === "draft" ? "draft" : v ? "version" : "live"} />
      <PropertyPage
        brief={shown.brief}
        content={shown.content}
        banner={
          shown.showBanner && (
            <div className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-[3px] bg-ink/90 px-3 py-2 text-[0.7rem] tracking-wide text-paper/85 shadow-lg backdrop-blur">
              <span className={view === "draft" ? "text-warn-soft" : ""}>{shown.label}</span>
              {!embed && (
                <Link href={`/campaigns/${id}/studio`} className="whitespace-nowrap underline underline-offset-2 hover:text-paper">
                  Open studio
                </Link>
              )}
            </div>
          )
        }
      />
    </>
  );
}
