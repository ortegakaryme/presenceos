import { PropertyBriefSchema, type AgentId, type AgentRunRecord, type Campaign, type ChangeLogEntry, type FieldValue, type Proposal, type Run } from "@/lib/domain/schemas";
import { FIELD_PATHS, getField, isEmptyValue, isFieldPath, valueSchemaFor } from "@/lib/domain/fields";
import { canApproveCampaign } from "@/lib/domain/stage";
import { newId, nowIso } from "@/lib/ids";
import { AGENTS, AGENT_ORDER, downstreamClosure } from "@/lib/agents/registry";
import { agentsForFeedback, interpretFeedback } from "@/lib/agents/feedback";
import { resolveMode } from "@/lib/agents/llm";
import { demoExecutor, modelExecutor, runPipeline } from "@/lib/builder/orchestrator";
import { applyApproved, currentContent, effectiveValue, restoreVersion, WorkflowError } from "@/lib/builder/apply";
import { baselineContent } from "@/lib/builder/baseline";
import { validateValue, validationContext } from "@/lib/builder/validation";
import { AGENT_LABEL } from "@/lib/builder/conflicts";
import { runQA } from "@/lib/qa/checks";
import { forwardEvent, type AnalyticsEvent, type EventName } from "@/lib/analytics/events";
import { sharedStore, storageMode, store } from "./store";
import { EXAMPLES, isExampleId } from "@/lib/domain/examples";
import { newOverlay, requestContext, type Overlay } from "./context";
import { sequentialIds } from "@/lib/ids";

export { WorkflowError };

export class BriefValidationError extends WorkflowError {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("The property brief has missing or invalid fields.", 422);
  }
}

function event(name: EventName, campaignId: string | undefined, props: Record<string, unknown> = {}): AnalyticsEvent {
  const e: AnalyticsEvent = { id: newId("evt"), name, at: nowIso(), campaignId, props };
  forwardEvent(e);
  return e;
}

async function track(name: EventName, campaignId: string | undefined, props: Record<string, unknown> = {}) {
  await store().appendEvents([event(name, campaignId, props)]);
}

/* ----------------------------- reads ----------------------------- */

/** All campaigns visible to this request; examples are always present (rebuilt if needed). */
export async function listCampaigns(): Promise<Campaign[]> {
  const list = await store().listCampaigns();
  const ids = new Set(list.map((c) => c.id));
  for (const ex of EXAMPLES) if (!ids.has(ex.id)) list.push(await builtExample(ex.id));
  return list.filter((c) => c.origin !== "example" || isExampleId(c.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Finds a campaign; an example is rebuilt from its fixed id when this instance has no copy. */
export async function findCampaign(id: string): Promise<Campaign | null> {
  const c = await store().getCampaign(id);
  if (c || !isExampleId(id)) return c;
  return builtExample(id);
}

export async function getCampaign(id: string): Promise<Campaign> {
  const c = await findCampaign(id);
  if (!c) throw new WorkflowError("Campaign not found.", 404);
  return c;
}

export async function listEvents(): Promise<AnalyticsEvent[]> {
  return store().listEvents();
}

/** Locked read-modify-write of one campaign. `fn` may push analytics events to record with it. */
async function mutate<T>(id: string, fn: (c: Campaign, events: AnalyticsEvent[]) => T): Promise<T> {
  const s = store();
  return s.withLock(`campaign:${id}`, async () => {
    const c = await findCampaign(id);
    if (!c) throw new WorkflowError("Campaign not found.", 404);
    const events: AnalyticsEvent[] = [];
    const result = fn(c, events);
    c.updatedAt = nowIso();
    await s.putCampaign(c);
    if (events.length) await s.appendEvents(events);
    return result;
  });
}

/* ----------------------------- intake ----------------------------- */

export async function createCampaign(input: unknown, opts: { start?: boolean; injectFailure?: boolean; origin?: "user" | "example"; delayMs?: number; id?: string } = {}) {
  const parsed = PropertyBriefSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".") || "brief"] ??= i.message;
    throw new BriefValidationError(fieldErrors);
  }
  const brief = parsed.data;
  const at = nowIso();
  const content = baselineContent(brief);
  const changelog: ChangeLogEntry[] = FIELD_PATHS.filter((f) => !isEmptyValue(getField(content, f))).map((f) => ({
    id: newId("log"),
    timestamp: at,
    version: 1,
    author: "builder",
    field: f,
    oldValue: null,
    newValue: getField(content, f),
    rationale: "Facts-only baseline created from the brief. No generated copy.",
    approval: "baseline",
  }));
  const origin = opts.origin ?? "user";
  const seedProps = origin === "example" ? { source: "seed" } : {};
  const campaign: Campaign = {
    id: opts.id ?? newId("cmp"),
    origin,
    createdAt: at,
    updatedAt: at,
    brief,
    currentVersion: 1,
    versions: [{ number: 1, createdAt: at, label: "Baseline from brief", source: "baseline", content, appliedChangeIds: [] }],
    proposals: [],
    conflicts: [],
    runs: [],
    changelog,
    qa: runQA(brief, content, 1, null, changelog),
    feedbackHistory: [],
    approval: null,
  };
  await store().putCampaign(campaign);
  await store().appendEvents([event("property_brief_submitted", campaign.id, { channels: brief.channels, images: brief.images.length, claimsToVerify: brief.claimsToVerify.length, ...seedProps })]);
  const run = opts.start === false ? null : await startRun(campaign.id, { injectFailure: opts.injectFailure, delayMs: opts.delayMs, eventProps: seedProps, persistProgress: origin !== "example" });
  return { campaign, run };
}

/* ----------------------------- runs ----------------------------- */

function latestOutputs(c: Campaign): Partial<Record<AgentId, { output: unknown; runId: string; record: AgentRunRecord }>> {
  const out: Partial<Record<AgentId, { output: unknown; runId: string; record: AgentRunRecord }>> = {};
  for (const run of c.runs) {
    for (const id of AGENT_ORDER) {
      const r = run.agents[id];
      if (r && (r.status === "completed" || r.status === "reused") && r.output != null) out[id] = { output: r.output, runId: r.reusedFromRunId ?? run.id, record: r };
    }
  }
  return out;
}

function rejectedHistory(c: Campaign) {
  return c.proposals
    .filter((p) => p.status === "rejected" || (p.status === "superseded" && p.validation.status === "blocked"))
    .map((p) => ({
      field: p.field,
      value: effectiveValue(p),
      agentId: p.agentId,
      note: p.decisionNote ?? p.validation.issues.map((i) => i.message).join(" "),
    }));
}

/**
 * Phase 2/9 — starts a discovery run. Iteration 1 runs every specialist. Later iterations
 * rerun only the agents the feedback targets plus everything downstream of them (facts and
 * QA always rerun); other agents' last validated outputs are reused as context.
 */
export async function startRun(campaignId: string, opts: { feedback?: string; injectFailure?: boolean; delayMs?: number; eventProps?: Record<string, unknown>; persistProgress?: boolean } = {}) {
  const { mode, model } = resolveMode();
  const delay = opts.delayMs ?? Number(process.env.DEMO_AGENT_DELAY_MS ?? 700);
  const extra = opts.eventProps ?? {};
  const executorBase = demoExecutor(Number.isFinite(delay) ? delay : 700);
  const executor = mode === "model" ? modelExecutor(model, executorBase) : executorBase;

  const setup = await mutate(campaignId, (c, events) => {
    if (c.runs.some((r) => r.status === "running")) throw new WorkflowError("A run is already in progress.", 409);
    const iteration = c.runs.length + 1;
    const feedbackText = opts.feedback?.trim();
    if (iteration > 1 && !feedbackText) throw new WorkflowError("Describe what the next iteration should change.");
    if (feedbackText) c.feedbackHistory.push({ iteration, text: feedbackText, at: nowIso() });
    const directives = interpretFeedback(c.feedbackHistory.map((f) => f.text));
    const previous = latestOutputs(c);
    // Facts and QA always rerun (cheap, deterministic) but do not pull their dependents along.
    const plan: AgentId[] = iteration === 1 ? [...AGENT_ORDER] : [...downstreamClosure(agentsForFeedback(directives)), "facts", "qa"];
    const planned = AGENT_ORDER.filter((a) => plan.includes(a) || !previous[a]);
    // Undecided proposals from earlier runs are preserved but marked stale.
    for (const p of c.proposals) if (p.status === "pending") Object.assign(p, { status: "stale", decisionNote: `Left undecided when iteration ${iteration} started.` });
    for (const k of c.conflicts) if (k.status === "open") k.status = "resolved";
    const run: Run = {
      id: newId("run"),
      iteration,
      status: "running",
      startedAt: nowIso(),
      feedback: feedbackText,
      plannedAgents: planned,
      injectFailure: !!opts.injectFailure,
      mode,
      agents: Object.fromEntries(
        AGENT_ORDER.map((id) => [id, { agentId: id, status: planned.includes(id) ? "queued" : "reused", task: planned.includes(id) ? "Waiting for dependencies" : "Reusing last validated output", executionMode: AGENTS[id].kind === "rule" ? "rule" : mode, attempts: 0, warnings: [], errors: [], acceptance: [], proposalIds: [] } satisfies AgentRunRecord]),
      ) as unknown as Record<AgentId, AgentRunRecord>,
    };
    c.runs.push(run);
    if (iteration > 1) events.push(event("iteration_started", c.id, { iteration, rerun: planned, feedback: feedbackText }));
    return { run, iteration, directives, previous, planned, brief: c.brief, current: currentContent(c), rejected: rejectedHistory(c) };
  });

  const completion = (async () => {
    try {
      const result = await runPipeline({
        runId: setup.run.id,
        iteration: setup.iteration,
        brief: setup.brief,
        current: setup.current,
        feedback: setup.directives,
        rejected: setup.rejected,
        plan: setup.planned,
        reused: setup.previous,
        mode,
        model,
        executor,
        injectFailure: !!opts.injectFailure,
        // Live per-agent progress (skipped for seeding, where nobody is watching).
        onUpdate: opts.persistProgress === false ? undefined : (record) =>
          mutate(campaignId, (c) => {
            const run = c.runs.find((r) => r.id === setup.run.id);
            if (run) run.agents[record.agentId] = record;
          }),
        onEvent: (name, props) => void track(name, campaignId, { ...props, ...extra }),
      });
      await mutate(campaignId, (c, events) => {
        const run = c.runs.find((r) => r.id === setup.run.id)!;
        run.agents = result.records;
        run.status = Object.values(result.records).some((r) => r.status === "failed" || r.status === "skipped") ? "completed_with_errors" : "completed";
        run.completedAt = nowIso();
        run.synthesis = result.stats;
        c.proposals.push(...result.proposals);
        c.conflicts.push(...result.conflicts);
        events.push(event("campaign_draft_created", c.id, { runId: run.id, iteration: run.iteration, ...result.stats, ...extra }));
        const qaIssues = (result.outputs.qa as { issues?: { severity: string }[] } | undefined)?.issues ?? [];
        const critical = qaIssues.filter((i) => i.severity === "critical").length;
        if (qaIssues.length) events.push(event("qa_issue_detected", c.id, { stage: "draft_review", runId: run.id, critical, total: qaIssues.length, ...extra }));
      });
    } catch (e) {
      await mutate(campaignId, (c) => {
        const run = c.runs.find((r) => r.id === setup.run.id);
        if (run && run.status === "running") {
          run.status = "completed_with_errors";
          run.completedAt = nowIso();
          for (const r of Object.values(run.agents)) if (r.status === "running" || r.status === "queued") Object.assign(r, { status: "failed", errors: [...r.errors, `Run aborted: ${e instanceof Error ? e.message : String(e)}`] });
        }
      });
    }
  })();

  return { runId: setup.run.id, iteration: setup.iteration, completion };
}

/* ----------------------------- review ----------------------------- */

function guardrails(c: Campaign): string[] {
  const latestBrand = latestOutputs(c).brand?.output as { guardrails?: string[] } | undefined;
  const current = currentContent(c).brand.guardrails;
  return current.length ? current : latestBrand?.guardrails ?? [];
}

function revalidate(c: Campaign, p: Proposal) {
  const v = validateValue(p.field, effectiveValue(p), validationContext(c.brief, guardrails(c)));
  p.validation = { status: v.status, issues: v.issues };
  p.risk = v.risk;
  return v;
}

export async function decideProposal(
  campaignId: string,
  proposalId: string,
  body: { action: "approve" | "reject" | "reset" | "edit"; editedValue?: FieldValue; note?: string },
) {
  return mutate(campaignId, (c, events) => {
    const p = c.proposals.find((x) => x.id === proposalId);
    if (!p) throw new WorkflowError("Proposal not found.", 404);
    if (p.status === "applied") throw new WorkflowError("This change is already applied. Restore an earlier version to undo it.");
    if (["stale", "auto_rejected"].includes(p.status) && body.action !== "reset") throw new WorkflowError("This proposal is archived and can no longer be decided.");
    const conflict = p.conflictId ? c.conflicts.find((k) => k.id === p.conflictId) : undefined;
    const siblings = conflict ? c.proposals.filter((x) => conflict.proposalIds.includes(x.id) && x.id !== p.id) : [];
    const note = body.note?.trim() || undefined;

    if (body.editedValue !== undefined) {
      const parsed = valueSchemaFor(p.field).safeParse(body.editedValue);
      if (!parsed.success) throw new WorkflowError(`Edited value is not valid for this field: ${parsed.error.issues[0]?.message}`);
      p.editedValue = parsed.data;
      revalidate(c, p);
      events.push(event("proposal_edited", c.id, { proposalId: p.id, field: p.field, agentId: p.agentId, validation: p.validation.status }));
    }

    if (body.action === "edit") return p;

    if (body.action === "approve") {
      if (p.status !== "pending") throw new WorkflowError("Only pending proposals can be approved.");
      const v = revalidate(c, p);
      if (v.status === "blocked") throw new WorkflowError("This change has critical issues. Edit it to resolve them before approving.", 422);
      p.status = "approved";
      p.decidedAt = nowIso();
      p.decidedBy = "human";
      p.decisionNote = note;
      for (const s of siblings) if (s.status === "pending") Object.assign(s, { status: "superseded", decidedAt: p.decidedAt, decisionNote: `Superseded — reviewer chose ${AGENT_LABEL[p.agentId]}'s option.` });
      if (conflict) Object.assign(conflict, { status: "resolved", resolvedProposalId: p.id });
      events.push(event("proposal_approved", c.id, { proposalId: p.id, field: p.field, agentId: p.agentId, iteration: p.iteration, edited: p.editedValue !== undefined, inConflict: !!conflict, followedRecommendation: conflict ? conflict.recommendation.proposalId === p.id : null }));
    } else if (body.action === "reject") {
      if (p.status !== "pending" && p.status !== "approved") throw new WorkflowError("Only pending or approved proposals can be rejected.");
      p.status = "rejected";
      p.decidedAt = nowIso();
      p.decisionNote = note;
      if (conflict && !c.proposals.some((x) => conflict.proposalIds.includes(x.id) && x.status === "pending")) conflict.status = "resolved";
      events.push(event("proposal_rejected", c.id, { proposalId: p.id, field: p.field, agentId: p.agentId, iteration: p.iteration }));
    } else if (body.action === "reset") {
      if (!["approved", "rejected"].includes(p.status)) throw new WorkflowError("Only decided proposals can be reset.");
      const latestRun = c.runs[c.runs.length - 1];
      if (p.runId !== latestRun?.id && p.runId !== "manual") throw new WorkflowError("Only proposals from the latest iteration can be reopened.");
      const wasApproved = p.status === "approved";
      Object.assign(p, { status: "pending", decidedAt: undefined, decisionNote: undefined });
      if (conflict) {
        if (wasApproved) for (const s of siblings) if (s.status === "superseded") Object.assign(s, { status: "pending", decidedAt: undefined, decisionNote: undefined });
        Object.assign(conflict, { status: "open", resolvedProposalId: undefined });
      }
    }
    return p;
  });
}

/** Approves Builder-recommended options that passed validation with no warnings. Human-triggered. */
export async function approveRecommended(campaignId: string, opts: { seed?: boolean } = {}) {
  return mutate(campaignId, (c, events) => {
    let count = 0;
    const pending = c.proposals.filter((p) => p.status === "pending");
    for (const p of pending) {
      if (p.status !== "pending") continue;
      const conflict = p.conflictId ? c.conflicts.find((k) => k.id === p.conflictId && k.status === "open") : undefined;
      if (conflict && conflict.recommendation.proposalId !== p.id) continue;
      if (revalidate(c, p).status !== "passed") continue;
      p.status = "approved";
      p.decidedAt = nowIso();
      p.decidedBy = opts.seed ? "seed" : "human";
      p.decisionNote = opts.seed ? "Pre-applied by the example seed (Builder recommendation, validation passed) — not a human decision." : "Approved in bulk (Builder recommendation, validation passed).";
      if (conflict) {
        for (const s of c.proposals) if (conflict.proposalIds.includes(s.id) && s.id !== p.id && s.status === "pending") Object.assign(s, { status: "superseded", decidedAt: p.decidedAt, decisionNote: `Superseded — reviewer chose ${AGENT_LABEL[p.agentId]}'s option.` });
        Object.assign(conflict, { status: "resolved", resolvedProposalId: p.id });
      }
      events.push(event("proposal_approved", c.id, { proposalId: p.id, field: p.field, agentId: p.agentId, iteration: p.iteration, edited: false, bulk: true, inConflict: !!conflict, followedRecommendation: conflict ? true : null, ...(opts.seed ? { source: "seed" } : {}) }));
      count++;
    }
    return { approved: count };
  });
}

/** Studio edits become human-authored proposals; they still go through validation and Apply. */
export async function submitHumanEdit(campaignId: string, body: { field: string; value: FieldValue; note?: string }) {
  return mutate(campaignId, (c, events) => {
    if (!isFieldPath(body.field)) throw new WorkflowError(`Unknown field "${body.field}".`);
    const parsed = valueSchemaFor(body.field).safeParse(body.value);
    if (!parsed.success) throw new WorkflowError(`Value is not valid for this field: ${parsed.error.issues[0]?.message}`);
    const current = getField(currentContent(c), body.field);
    const v = validateValue(body.field, parsed.data, validationContext(c.brief, guardrails(c)));
    const at = nowIso();
    const p: Proposal = {
      id: newId("chg"),
      runId: "manual",
      iteration: c.runs[c.runs.length - 1]?.iteration ?? 1,
      agentId: "human",
      field: body.field,
      currentValue: current,
      proposedValue: parsed.data,
      rationale: body.note?.trim() || "Edited by reviewer in the Creative Studio.",
      evidence: [],
      validation: { status: v.status, issues: v.issues },
      risk: v.risk,
      status: v.status === "blocked" ? "pending" : "approved",
      createdAt: at,
      decidedAt: v.status === "blocked" ? undefined : at,
    };
    // A new human edit supersedes undecided proposals for the same field.
    for (const x of c.proposals) if (x.field === p.field && x.status === "pending") Object.assign(x, { status: "superseded", decisionNote: "Superseded by a reviewer edit." });
    c.proposals.push(p);
    events.push(event("proposal_edited", c.id, { proposalId: p.id, field: p.field, agentId: "human", validation: v.status }));
    return p;
  });
}

/* ----------------------------- apply / approve ----------------------------- */

export async function applyChanges(campaignId: string) {
  return mutate(campaignId, (c, events) => {
    if (c.runs.some((r) => r.status === "running")) throw new WorkflowError("Wait for the current run to finish before applying.", 409);
    const { campaign, version, applied } = applyApproved(c);
    Object.assign(c, campaign);
    const src = applied.every((p) => p.decidedBy === "seed") ? { source: "seed" } : {};
    events.push(event("changes_applied", c.id, { version: version.number, count: applied.length, ...src }));
    const crit = c.qa?.issues.filter((i) => i.severity === "critical").length ?? 0;
    if (c.qa?.issues.length) events.push(event("qa_issue_detected", c.id, { stage: "post_apply", version: version.number, critical: crit, total: c.qa.issues.length, ...src }));
    return { version: version.number, applied: applied.length, qa: c.qa };
  });
}

export async function approveCampaign(campaignId: string) {
  return mutate(campaignId, (c, events) => {
    const gate = canApproveCampaign(c);
    if (!gate.ok) throw new WorkflowError(gate.reasons.join(" "), 409);
    c.approval = { version: c.currentVersion, at: nowIso() };
    events.push(event("campaign_approved", c.id, { version: c.currentVersion }));
    return c.approval;
  });
}

export async function restore(campaignId: string, versionNumber: number) {
  return mutate(campaignId, (c, events) => {
    if (c.runs.some((r) => r.status === "running")) throw new WorkflowError("Wait for the current run to finish.", 409);
    const { campaign, version } = restoreVersion(c, versionNumber);
    Object.assign(c, campaign);
    events.push(event("version_restored", c.id, { from: versionNumber, version: version.number }));
    return { version: version.number };
  });
}

export async function deleteCampaign(campaignId: string) {
  if (isExampleId(campaignId)) throw new WorkflowError("Example campaigns can't be deleted.", 403);
  const s = store();
  await s.withLock(`campaign:${campaignId}`, async () => {
    if (!(await s.deleteCampaign(campaignId))) throw new WorkflowError("Campaign not found.", 404);
  });
}

export async function recordClientEvent(name: EventName, campaignId: string | undefined, props: Record<string, unknown>) {
  if (campaignId && !(await store().getCampaign(campaignId))) throw new WorkflowError("Campaign not found.", 404);
  await track(name, campaignId, props);
}

/* ----------------------------- example campaigns ----------------------------- */

// Shared by every route bundle in this process (each bundle has its own module instances).
const exampleCache: Map<string, Promise<Campaign>> = ((globalThis as unknown as { __presenceExamples?: Map<string, Promise<Campaign>> }).__presenceExamples ??= new Map());

/**
 * Builds an example campaign from its fixed id: agents really run, in an isolated context with a
 * deterministic id sequence, so every server instance produces the same campaign (same proposal,
 * conflict and changelog ids). For most examples the Builder's validation-passed recommendations
 * are then pre-applied and labelled as seeded. Seed activity is excluded from workflow metrics.
 */
async function buildExample(id: string): Promise<Campaign> {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new WorkflowError("Unknown example.", 404);
  const overlay = newOverlay([], false);
  return requestContext.run({ overlay, nextId: sequentialIds(ex.id) }, async () => {
    const { run } = await createCampaign(ex.brief, { origin: "example", delayMs: 0, id: ex.id });
    await run?.completion;
    if (ex.preApply) {
      await approveRecommended(ex.id, { seed: true });
      await applyChanges(ex.id).catch(() => undefined);
    }
    const c = overlay.campaigns.get(ex.id);
    if (!c) throw new Error(`Example ${ex.id} was not built`);
    return c;
  });
}

/** Uncached build — exported for determinism tests. */
export const rebuildExample = buildExample;

/** Built example (memoised per instance). Returns a copy. */
export async function builtExample(id: string): Promise<Campaign> {
  if (!exampleCache.has(id)) exampleCache.set(id, buildExample(id).catch((e) => { exampleCache.delete(id); throw e; }));
  return structuredClone(await exampleCache.get(id)!);
}

/**
 * Makes sure the shared store holds every example under its fixed id, and removes example
 * campaigns created by older versions (random ids). No-op in browser mode, where examples are
 * rebuilt on demand and visitors keep their own copies.
 */
export async function ensureExamples(): Promise<number> {
  if (storageMode() === "browser") return 0;
  const s = sharedStore();
  return s.withLock("seed", async () => {
    let added = 0;
    for (const c of await s.listCampaigns()) if (c.origin === "example" && !isExampleId(c.id)) await s.deleteCampaign(c.id);
    for (const ex of EXAMPLES) {
      if (await s.getCampaign(ex.id)) continue;
      await s.putCampaign(await builtExample(ex.id));
      added++;
    }
    return added;
  });
}

/** Re-adds missing examples. Kept for the /api/examples route. */
export async function seedExamples(): Promise<number> {
  return ensureExamples();
}

/* ----------------------------- browser-held state ----------------------------- */

export interface BrowserState {
  campaigns: Campaign[];
  deleted: string[];
  events: AnalyticsEvent[];
}

function looksLikeCampaign(x: unknown): x is Campaign {
  const c = x as Campaign;
  return !!c && typeof c === "object" && typeof c.id === "string" && Array.isArray(c.versions) && Array.isArray(c.proposals) && Array.isArray(c.runs) && PropertyBriefSchema.safeParse(c.brief).success;
}

/**
 * In browser mode, runs `fn` against the campaign copy the browser sent (examples fall back to the
 * rebuilt originals) and returns what changed, for the browser to save. In server mode it just runs `fn`.
 * Browser-sent state is only ever used to compute a response for that same browser; it is never stored.
 */
export async function withBrowserState<T>(raw: unknown, fn: () => Promise<T>): Promise<{ result: T; state?: BrowserState }> {
  if (storageMode() !== "browser") return { result: await fn() };
  const sent = (raw as { campaigns?: unknown[] } | undefined)?.campaigns ?? [];
  if (!Array.isArray(sent) || sent.length > 5) throw new WorkflowError("Invalid browser state.");
  const campaigns = sent.filter(looksLikeCampaign);
  if (campaigns.length !== sent.length) throw new WorkflowError("Invalid campaign data in browser state.");
  const overlay: Overlay = newOverlay(campaigns, true);
  const result = await requestContext.run({ overlay }, fn);
  return {
    result,
    state: {
      campaigns: [...overlay.touched].map((id) => overlay.campaigns.get(id)).filter((c): c is Campaign => !!c),
      deleted: [...overlay.deleted],
      events: overlay.events,
    },
  };
}
