import type { Campaign, ChangeLogEntry, FieldValue, Proposal, Version } from "@/lib/domain/schemas";
import { getField, setField, valuesEqual, FIELD_PATHS } from "@/lib/domain/fields";
import { newId, nowIso } from "@/lib/ids";
import { runQA } from "@/lib/qa/checks";
import { validateValue, validationContext } from "./validation";

export class WorkflowError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function effectiveValue(p: Proposal): FieldValue {
  return p.editedValue ?? p.proposedValue;
}

export function currentContent(c: Campaign) {
  const v = c.versions.find((x) => x.number === c.currentVersion);
  if (!v) throw new WorkflowError("Campaign has no current version", 500);
  return v.content;
}

/**
 * Phase 6 — the only path by which content changes. Applies approved proposals (and nothing
 * else) to the current version, creating a new immutable version, a changelog entry per field,
 * and a fresh QA + regression report.
 */
export function applyApproved(c: Campaign): { campaign: Campaign; version: Version; applied: Proposal[] } {
  const approved = c.proposals.filter((p) => p.status === "approved").sort((a, b) => (a.decidedAt ?? "").localeCompare(b.decidedAt ?? ""));
  if (!approved.length) throw new WorkflowError("There are no approved changes to apply.");
  let content = currentContent(c);
  const vc = validationContext(c.brief, content.brand.guardrails);
  const number = Math.max(...c.versions.map((v) => v.number)) + 1;
  const entries: ChangeLogEntry[] = [];
  const at = nowIso();
  for (const p of approved) {
    const value = effectiveValue(p);
    const v = validateValue(p.field, value, vc);
    if (!v.valid || v.status === "blocked") throw new WorkflowError(`Change ${p.id} (${p.field}) no longer passes validation: ${v.issues[0]?.message ?? "invalid"}`);
    const old = getField(content, p.field);
    content = setField(content, p.field, value);
    entries.push({
      id: newId("log"),
      timestamp: at,
      version: number,
      changeId: p.id,
      author: p.agentId,
      field: p.field,
      oldValue: old,
      newValue: value,
      rationale: p.decisionNote ? `${p.rationale} — Reviewer note: ${p.decisionNote}` : p.rationale,
      approval: p.decidedBy === "seed" ? "example_seed" : p.editedValue !== undefined ? "approved_with_edits" : "approved",
    });
  }
  const version: Version = { number, createdAt: at, label: `${approved.length} approved change${approved.length > 1 ? "s" : ""}`, source: "apply", content, appliedChangeIds: approved.map((p) => p.id) };
  const proposals = c.proposals.map((p) => (approved.some((a) => a.id === p.id) ? { ...p, status: "applied" as const, appliedInVersion: number } : p));
  const changelog = [...c.changelog, ...entries];
  const qa = runQA(c.brief, content, number, c.qa, changelog);
  return { campaign: { ...c, proposals, versions: [...c.versions, version], currentVersion: number, changelog, qa, approval: null, updatedAt: at }, version, applied: approved };
}

/** Non-destructive restore: creates a new version whose content equals an earlier one. */
export function restoreVersion(c: Campaign, target: number): { campaign: Campaign; version: Version } {
  const src = c.versions.find((v) => v.number === target);
  if (!src) throw new WorkflowError(`Version ${target} does not exist.`, 404);
  if (target === c.currentVersion) throw new WorkflowError("That version is already current.");
  const cur = currentContent(c);
  const number = Math.max(...c.versions.map((v) => v.number)) + 1;
  const at = nowIso();
  const entries: ChangeLogEntry[] = FIELD_PATHS.filter((f) => !valuesEqual(getField(cur, f), getField(src.content, f))).map((f) => ({
    id: newId("log"),
    timestamp: at,
    version: number,
    author: "human",
    field: f,
    oldValue: getField(cur, f),
    newValue: getField(src.content, f),
    rationale: `Restored from v${target}.`,
    approval: "restored",
  }));
  const version: Version = { number, createdAt: at, label: `Restored v${target}`, source: "restore", content: structuredClone(src.content), appliedChangeIds: [], restoredFrom: target };
  const changelog = [...c.changelog, ...entries];
  const qa = runQA(c.brief, version.content, number, c.qa, changelog);
  return { campaign: { ...c, versions: [...c.versions, version], currentVersion: number, changelog, qa, approval: null, updatedAt: at }, version };
}
