import { describe, expect, it } from "vitest";
import { PropertyBriefSchema, type AgentId } from "@/lib/domain/schemas";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import { AGENTS, AGENT_ORDER } from "@/lib/agents/registry";
import { NO_FEEDBACK } from "@/lib/agents/feedback";
import { baselineContent } from "@/lib/builder/baseline";
import { demoExecutor, runPipeline, type Executor } from "@/lib/builder/orchestrator";

const brief = PropertyBriefSchema.parse(SAMPLE_BRIEF);
const base = {
  runId: "run_test",
  iteration: 1,
  brief,
  current: baselineContent(brief),
  feedback: NO_FEEDBACK,
  rejected: [],
  plan: [...AGENT_ORDER],
  reused: {},
  mode: "demo" as const,
  injectFailure: false,
};

describe("Builder orchestration", () => {
  it("runs all twelve specialists, respecting dependencies and running independent agents concurrently", async () => {
    const r = await runPipeline({ ...base, executor: demoExecutor(5) });
    for (const id of AGENT_ORDER) expect(r.records[id].status, id).toBe("completed");
    const at = (id: AgentId, ev: "start" | "end") => r.timeline.find((t) => t.agentId === id && t.event === ev)!.at;
    for (const id of AGENT_ORDER) for (const dep of AGENTS[id].dependsOn) expect(at(id, "start")).toBeGreaterThanOrEqual(at(dep, "end"));
    // Wave 0 agents all start before any of them finishes.
    const firstEnd = Math.min(at("audience", "end"), at("market", "end"), at("facts", "end"));
    expect(Math.max(at("audience", "start"), at("market", "start"), at("facts", "start"))).toBeLessThanOrEqual(firstEnd);
  });

  it("surfaces conflicts with a recommendation instead of silently choosing", async () => {
    const r = await runPipeline({ ...base, executor: demoExecutor(0) });
    const byField = Object.fromEntries(r.conflicts.map((c) => [c.field, c]));
    expect(Object.keys(byField)).toEqual(expect.arrayContaining(["landing.heroHeadline", "landing.ctaLabel", "landing.sectionOrder", "listing.copy"]));
    const agentOf = (field: string) => r.proposals.find((p) => p.id === byField[field].recommendation.proposalId)!.agentId;
    expect(agentOf("landing.heroHeadline")).toBe("copy");
    expect(agentOf("landing.ctaLabel")).toBe("brand");
    expect(agentOf("landing.sectionOrder")).toBe("ux");
    expect(agentOf("listing.copy")).toBe("qa");
    expect(r.proposals.every((p) => p.status === "pending" || p.status === "auto_rejected")).toBe(true);
  });

  it("blocks drafts with unverified claims and has QA propose a correction", async () => {
    const r = await runPipeline({ ...base, executor: demoExecutor(0) });
    const draft = r.proposals.find((p) => p.agentId === "copy" && p.field === "listing.copy")!;
    expect(draft.validation.status).toBe("blocked");
    expect(draft.validation.issues.map((i) => i.code)).toContain("unverified_claim");
    const fix = r.proposals.find((p) => p.correctsProposalId === draft.id)!;
    expect(fix.agentId).toBe("qa");
    expect(fix.validation.status).toBe("passed");
    expect(String(fix.proposedValue)).not.toMatch(/forest/i);
  });

  it("rejects malformed output, retries, and records the failure", async () => {
    const events: string[] = [];
    const r = await runPipeline({ ...base, injectFailure: true, executor: demoExecutor(0), onEvent: (n) => events.push(n) });
    expect(r.records.market.status).toBe("completed");
    expect(r.records.market.attempts).toBe(2);
    expect(r.records.market.errors[0]).toMatch(/failed schema validation/);
    expect(events).toContain("agent_run_failed");
  });

  it("skips dependents when an agent fails permanently", async () => {
    const failing: Executor = async (agent, input, ctx, o) => {
      if (agent.id === "brand") throw new Error("boom");
      return demoExecutor(0)(agent, input, ctx, o);
    };
    const r = await runPipeline({ ...base, executor: failing });
    expect(r.records.brand.status).toBe("failed");
    for (const id of ["copy", "visual", "social", "seo", "qa", "analytics"] as AgentId[]) expect(r.records[id].status, id).toBe("skipped");
    expect(r.records.ux.status).toBe("completed");
  });

  it("never proposes a value identical to the current one", async () => {
    const r = await runPipeline({ ...base, executor: demoExecutor(0) });
    expect(r.proposals.some((p) => JSON.stringify(p.proposedValue) === JSON.stringify(p.currentValue))).toBe(false);
  });
});
