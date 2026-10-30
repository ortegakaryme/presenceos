"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Campaign } from "@/lib/domain/schemas";
import { CampaignProvider } from "@/lib/client/CampaignContext";
import { getLocalCampaign, useLocalRevision } from "@/lib/client/localStore";
import type { StorageMode } from "@/lib/client/mode";
import { CampaignHeader } from "./CampaignHeader";

/**
 * Resolves the campaign for a page: the server copy, or — in browser-storage mode — this
 * browser's copy, which wins when present (it holds the visitor's own changes).
 */
export function CampaignGate({ id, initial, mode, children }: { id: string; initial: Campaign | null; mode: StorageMode; children: React.ReactNode }) {
  const rev = useLocalRevision();
  const ready = mode === "server" || rev !== null;
  // Read once per mount when ready; later changes flow through the CampaignProvider itself.
  const local = useMemo(() => (mode === "browser" && ready ? getLocalCampaign(id) : null), [mode, ready, id]);
  const campaign = local ?? initial;

  if (!campaign) {
    if (!ready) return <p className="mx-auto max-w-[88rem] px-4 py-16 text-sm text-stone md:px-8">Loading campaign…</p>;
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
        <p className="eyebrow text-taupe">Not found</p>
        <h1 className="font-display mt-2 text-4xl">This campaign isn’t in this browser</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone">On this demo, campaigns you create are saved in the browser that created them. Open the link in that browser, or start a new campaign here.</p>
        <Link href="/" className="mt-6 text-sm underline underline-offset-4">Back to overview</Link>
      </div>
    );
  }
  return (
    <CampaignProvider key={`${local ? "local" : "server"}:${campaign.id}`} initial={campaign}>
      <CampaignHeader />
      <div className="mx-auto max-w-[88rem] px-4 py-8 md:px-8">{children}</div>
    </CampaignProvider>
  );
}
