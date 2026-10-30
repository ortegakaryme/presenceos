"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { getStorageMode } from "@/lib/client/mode";
import { removeLocalCampaign } from "@/lib/client/localStore";
import { Button } from "./ui";

/** Two-step delete: the first click asks for confirmation, the second deletes. */
export function DeleteCampaignButton({ id, name, redirectTo, size = "sm", onDeleted }: { id: string; name: string; redirectTo?: string; size?: "sm" | "md"; onDeleted?: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button variant="ghost" size={size} onClick={() => setConfirming(true)} aria-label={`Delete ${name}`}>
        Delete
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label={`Confirm deleting ${name}`}>
      <span className="text-xs text-bad">Delete “{name}”?</span>
      <Button
        ref={confirmRef}
        variant="danger"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            // In browser-storage mode the campaign only exists in this browser.
            if (getStorageMode() === "browser") removeLocalCampaign(id);
            else await api(`/api/campaigns/${id}`, { method: "DELETE" });
            onDeleted?.();
            if (redirectTo) router.push(redirectTo);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}

export function RestoreExamplesButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (missing === 0) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/examples", { body: {} }).catch(() => undefined);
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Running agents…" : `Restore ${missing} example${missing > 1 ? "s" : ""}`}
    </Button>
  );
}
