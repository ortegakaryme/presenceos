import type { AgentId, AgentRunRecord, CampaignContent, Conflict, Proposal, PropertyBrief } from "@/lib/domain/schemas";
import { getField, valuesEqual } from "@/lib/domain/fields";
import { newId, nowIso } from "@/lib/ids";
import { AGENTS, AGENT_ORDER } from "@/lib/agents/registry";
import type { AgentContext, AgentDefinition } from "@/lib/agents/types";
import type { FeedbackDirectives } from "@/lib/agents/feedback";
import { runModelAgent, type ExecutionMode } from "@/lib/agents/llm";
import { validateValue, validationContext } from "./validation";
import { detectConflicts } from "./conflicts";
import type { BrandOutput } from "@/lib/agents/specialists/brand";

export interface ExecutorResult {
  output: unknown;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
}
export type Executor = (agent: AgentDefinition, input: unknown, ctx: AgentContext, opts: { attempt: number; malformed: boolean }) => Promise<ExecutorResult>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic demo executor. Optionally returns a malformed payload to exercise Builder validation. */
export function demoExecutor(delayMs: number): Executor {
  return async (agent, input, ctx, { malformed }) => {
    if (delayMs > 0) await sleep(delayMs * (0.6 + ((agent.number.charCodeAt(1) * 7) % 10) / 12));
    const output = agent.demo(input, ctx) as Record<string, unknown>;
    if (malformed) {
      // Simulates a model returning an incomplete object: a required field is missing.
      const broken = { ...output };
      delete broken[Object.keys(output).find((k) => !["summary", "rationale", "warnings", "assumptions"].includes(k)) ?? "summary"];
      return { output: broken };
    }
    return { output };
  };
}

export function modelExecutor(model: string, fallback: Executor): Executor {
  return async (agent, input, ctx, opts) => {
    if (agent.kind === "rule") return fallback(agent, input, ctx, opts);
    if (opts.malformed) return fallback(agent, input, ctx, opts);
    return runModelAgent(agent, input, model);
  };
}

export interface PipelineParams {
  runId: string;
  iteration: number;
  brief: PropertyBrief;
  current: CampaignContent;
  feedback: FeedbackDirectives;
  rejected: AgentContext["rejected"];
  plan: AgentId[];
  reused: Partial<Record<AgentId, { output: unknown; runId: string; record: AgentRunRecord }>>;
  mode: ExecutionMode;
  model?: string;
  executor: Executor;
  injectFailure: boolean;
  maxAttempts?: number;
  onUpdate?: (record: AgentRunRecord) => void | Promise<void>;
  onEvent?: (name: "agent_run_started" | "agent_run_completed" | "agent_run_failed", props: Record<string, unknown>) => void;
}

export interface PipelineResult {
  records: Record<AgentId, AgentRunRecord>;
  proposals: Proposal[];
  conflicts: Conflict[];
  outputs: Partial<Record<AgentId, unknown>>;
  stats: { proposalsCreated: number; autoRejected: number; noOpDiscarded: number; conflicts: number; blocked: number };
  /** Agent start/finish order — used by tests to verify dependency ordering and parallelism. */
  timeline: { agentId: AgentId; event: "start" | "end"; at: number }[];
}

function formatZodError(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * The Builder's execution core. Runs the planned specialists as a dependency graph —
 * every agent starts as soon as all of its dependencies have produced validated output,
 * so independent agents run concurrently. Each output is schema-validated and checked
 * against the agent's acceptance criteria; failures are retried, then reported.
 * Specialists only return proposals; nothing here mutates the live campaign.
 */
export async function runPipeline(p: PipelineParams): Promise<PipelineResult> {
  const maxAttempts = p.maxAttempts ?? 2;
  const records = {} as Record<AgentId, AgentRunRecord>;
  const outputs: Partial<Record<AgentId, unknown>> = {};
  const drafted: Proposal[] = [];
  const timeline: PipelineResult["timeline"] = [];
  const t0 = Date.now();
  let noOp = 0;
  let autoRejected = 0;

  for (const id of AGENT_ORDER) {
    const reuse = p.reused[id];
    if (!p.plan.includes(id) && reuse) {
      outputs[id] = reuse.output;
      records[id] = { ...reuse.record, status: "reused", reusedFromRunId: reuse.runId, proposalIds: [] };
    } else {
      records[id] = { agentId: id, status: "queued", task: "Waiting for dependencies", executionMode: AGENTS[id].kind === "rule" ? "rule" : p.mode, attempts: 0, warnings: [], errors: [], acceptance: [], proposalIds: [] };
    }
  }

  const guardrailsFor = () => (outputs.brand as BrandOutput | undefined)?.guardrails ?? p.current.brand.guardrails;

  const ctxFor = (): AgentContext => ({
    brief: p.brief,
    iteration: p.iteration,
    current: p.current,
    feedback: p.feedback,
    upstream: outputs,
    rejected: p.rejected,
    drafted,
  });

  const update = async (id: AgentId, patch: Partial<AgentRunRecord>) => {
    records[id] = { ...records[id], ...patch };
    await p.onUpdate?.(records[id]);
  };

  async function runAgent(id: AgentId): Promise<boolean> {
    const agent = AGENTS[id];
    const ctx = ctxFor();
    const startedAt = nowIso();
    timeline.push({ agentId: id, event: "start", at: Date.now() - t0 });
    await update(id, { status: "running", task: agent.task(ctx), startedAt, errors: [] });
    p.onEvent?.("agent_run_started", { agentId: id, runId: p.runId, mode: records[id].executionMode });
    const errors: string[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const input = agent.inputSchema.parse(agent.buildInput(ctx));
        const malformed = p.injectFailure && id === "market" && attempt === 1;
        const result = await p.executor(agent, input, ctx, { attempt, malformed });
        const parsed = agent.outputSchema.safeParse(result.output);
        if (!parsed.success) throw new Error(`Rejected by Builder — output failed schema validation (${formatZodError(parsed.error)})`);
        const acceptance = agent.accept(parsed.data, input, ctx);
        const failed = acceptance.filter((a) => !a.passed);
        if (failed.length) throw new Error(`Rejected by Builder — acceptance criteria not met: ${failed.map((f) => f.criterion).join("; ")}`);

        const vc = validationContext(p.brief, id === "brand" ? (parsed.data as BrandOutput).guardrails : guardrailsFor());
        const proposalIds: string[] = [];
        for (const d of agent.proposals(parsed.data, input, ctx)) {
          const current = getField(p.current, d.field);
          if (valuesEqual(current, d.value)) {
            noOp++;
            continue;
          }
          const v = validateValue(d.field, d.value, vc);
          const previouslyRejected = p.rejected.some((r) => r.field === d.field && valuesEqual(r.value, d.value));
          const proposal: Proposal = {
            id: newId("chg"),
            runId: p.runId,
            iteration: p.iteration,
            agentId: id,
            field: d.field,
            currentValue: current,
            proposedValue: d.value,
            rationale: d.rationale,
            evidence: d.evidence,
            validation: { status: v.status, issues: v.issues },
            risk: v.risk,
            status: !v.valid || previouslyRejected ? "auto_rejected" : "pending",
            createdAt: nowIso(),
            decisionNote: !v.valid ? "Rejected by Builder: invalid value" : previouslyRejected ? "Rejected by Builder: identical to a proposal a reviewer already rejected" : undefined,
          };
          if (proposal.status === "auto_rejected") autoRejected++;
          if (d.correctsField) {
            const target = drafted.find((x) => x.agentId === d.correctsField!.agentId && x.field === d.correctsField!.field && x.runId === p.runId);
            if (target) proposal.correctsProposalId = target.id;
          }
          drafted.push(proposal);
          proposalIds.push(proposal.id);
        }
        outputs[id] = parsed.data;
        const o = parsed.data as { rationale?: string; warnings?: string[] };
        const completedAt = nowIso();
        timeline.push({ agentId: id, event: "end", at: Date.now() - t0 });
        await update(id, {
          status: "completed",
          attempts: attempt,
          completedAt,
          durationMs: Date.parse(completedAt) - Date.parse(startedAt),
          summary: agent.summarize(parsed.data),
          rationale: o.rationale,
          warnings: o.warnings ?? [],
          errors,
          acceptance,
          output: parsed.data,
          proposalIds,
          model: result.model,
          usage: result.usage,
        });
        p.onEvent?.("agent_run_completed", { agentId: id, runId: p.runId, attempts: attempt, proposals: proposalIds.length, durationMs: records[id].durationMs });
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Attempt ${attempt}: ${msg}`);
        p.onEvent?.("agent_run_failed", { agentId: id, runId: p.runId, attempt, error: msg, final: attempt === maxAttempts });
        await update(id, { attempts: attempt, errors: [...errors], task: attempt < maxAttempts ? "Retrying after rejected output" : records[id].task });
      }
    }
    const completedAt = nowIso();
    timeline.push({ agentId: id, event: "end", at: Date.now() - t0 });
    await update(id, { status: "failed", completedAt, durationMs: Date.parse(completedAt) - Date.parse(startedAt), errors });
    return false;
  }

  // Dependency-graph scheduler.
  const done = new Set<AgentId>(AGENT_ORDER.filter((id) => records[id].status === "reused"));
  const failed = new Set<AgentId>();
  const remaining = new Set<AgentId>(AGENT_ORDER.filter((id) => records[id].status === "queued"));
  const running = new Map<AgentId, Promise<void>>();
  while (remaining.size || running.size) {
    for (const id of [...remaining]) {
      const deps = AGENTS[id].dependsOn;
      const missing = deps.filter((d) => !done.has(d) && !remaining.has(d) && !running.has(d));
      if (deps.some((d) => failed.has(d)) || missing.length) {
        remaining.delete(id);
        failed.add(id);
        const blockers = deps.filter((d) => failed.has(d) || missing.includes(d));
        await update(id, { status: "skipped", task: "Skipped — a dependency did not complete", errors: [`Blocked by: ${blockers.join(", ")}`] });
      }
    }
    const ready = [...remaining].filter((id) => AGENTS[id].dependsOn.every((d) => done.has(d)));
    for (const id of ready) {
      remaining.delete(id);
      running.set(
        id,
        runAgent(id).then((ok) => {
          running.delete(id);
          (ok ? done : failed).add(id);
        }),
      );
    }
    if (running.size) await Promise.race(running.values());
    else if (remaining.size && !ready.length) break; // unreachable with an acyclic graph
  }

  const conflicts = detectConflicts(p.runId, drafted);
  return {
    records,
    proposals: drafted,
    conflicts,
    outputs,
    timeline,
    stats: {
      proposalsCreated: drafted.length,
      autoRejected,
      noOpDiscarded: noOp,
      conflicts: conflicts.length,
      blocked: drafted.filter((d) => d.validation.status === "blocked" && d.status === "pending").length,
    },
  };
}
