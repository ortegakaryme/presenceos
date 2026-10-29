"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import { api } from "@/lib/client/api";
import { Button } from "./ui";

export function QuickStart({ variant = "primary", label = "Run the sample campaign" }: { variant?: "primary" | "secondary" | "light"; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        size="lg"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { id } = await api<{ id: string }>("/api/campaigns", { body: { brief: SAMPLE_BRIEF } });
            router.push(`/campaigns/${id}/agents`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not start the sample.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Starting agents…" : label}
      </Button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
