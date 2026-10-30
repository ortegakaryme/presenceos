"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Campaign } from "@/lib/domain/schemas";
import { api } from "./api";
import { getStorageMode } from "./mode";
import { getLocalCampaign } from "./localStore";

interface Ctx {
  campaign: Campaign;
  refresh: () => Promise<void>;
  /** Runs a mutation, refreshes the campaign, and surfaces errors. */
  act: <T>(key: string, fn: () => Promise<T>) => Promise<T | undefined>;
  busy: string | null;
  error: string | null;
  clearError: () => void;
  running: boolean;
}

const CampaignCtx = createContext<Ctx | null>(null);

export function CampaignProvider({ initial, children }: { initial: Campaign; children: React.ReactNode }) {
  const [campaign, setCampaign] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = campaign.runs.some((r) => r.status === "running");
  const idRef = useRef(initial.id);

  const refresh = useCallback(async () => {
    // Browser-storage mode: this browser's copy is the source of truth when it has one.
    if (getStorageMode() === "browser") {
      const local = getLocalCampaign(idRef.current);
      if (local) {
        setCampaign(local);
        return;
      }
    }
    try {
      setCampaign(await api<Campaign>(`/api/campaigns/${idRef.current}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh the campaign.");
    }
  }, []);

  useEffect(() => {
    if (!running || getStorageMode() === "browser") return;
    const t = setInterval(refresh, 800);
    return () => clearInterval(t);
  }, [running, refresh]);

  const act = useCallback(
    async <T,>(key: string, fn: () => Promise<T>) => {
      setBusy(key);
      setError(null);
      try {
        const r = await fn();
        await refresh();
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        await refresh();
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return <CampaignCtx.Provider value={{ campaign, refresh, act, busy, error, clearError: () => setError(null), running }}>{children}</CampaignCtx.Provider>;
}

export function useCampaign() {
  const c = useContext(CampaignCtx);
  if (!c) throw new Error("useCampaign must be used inside CampaignProvider");
  return c;
}
