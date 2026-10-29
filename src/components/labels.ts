import type { AgentRunStatus } from "@/lib/domain/schemas";
import type { Tone } from "./ui";

export const RUN_STATUS: Record<AgentRunStatus, { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  completed: { label: "Completed", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  skipped: { label: "Skipped", tone: "warn" },
  reused: { label: "Reused", tone: "neutral" },
};

export const MODE_LABEL = { demo: "Demo · simulated", model: "Model call", rule: "Rule-based" } as const;
