import type { Campaign } from "./schemas";

export type Stage = "intake" | "running" | "review" | "blocked" | "ready" | "approved";

export const STAGE_LABEL: Record<Stage, string> = {
  intake: "Intake",
  running: "Agents running",
  review: "Awaiting review",
  blocked: "Blocked by QA",
  ready: "Ready for approval",
  approved: "Approved",
};

export function criticalOpen(c: Campaign): number {
  return c.qa?.issues.filter((i) => i.severity === "critical").length ?? 0;
}

export function stageOf(c: Campaign): Stage {
  const latest = c.runs[c.runs.length - 1];
  if (!latest) return "intake";
  if (latest.status === "running") return "running";
  if (c.approval && c.approval.version === c.currentVersion) return "approved";
  if (c.proposals.some((p) => p.status === "pending" || p.status === "approved")) return "review";
  if (criticalOpen(c) > 0) return "blocked";
  return c.currentVersion > 1 ? "ready" : "review";
}

export function canApproveCampaign(c: Campaign): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (c.runs.some((r) => r.status === "running")) reasons.push("Agents are still running.");
  if (c.currentVersion <= 1) reasons.push("No agent proposals have been applied yet.");
  const crit = criticalOpen(c);
  if (crit) reasons.push(`${crit} critical QA issue${crit > 1 ? "s" : ""} unresolved.`);
  const approvedUnapplied = c.proposals.filter((p) => p.status === "approved").length;
  if (approvedUnapplied) reasons.push(`${approvedUnapplied} approved change${approvedUnapplied > 1 ? "s are" : " is"} not yet applied.`);
  if (c.approval?.version === c.currentVersion) reasons.push("This version is already approved.");
  return { ok: reasons.length === 0, reasons };
}
