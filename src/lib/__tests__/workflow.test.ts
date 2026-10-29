import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import { getField } from "@/lib/domain/fields";
import { canApproveCampaign } from "@/lib/domain/stage";
import { computeMetrics } from "@/lib/analytics/metrics";

type Svc = typeof import("@/lib/server/campaigns");
let svc: Svc;

beforeAll(async () => {
  process.env.PRESENCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "presenceos-"));
  process.env.PRESENCE_MODE = "demo";
  process.env.DEMO_AGENT_DELAY_MS = "0";
  svc = await import("@/lib/server/campaigns");
});

async function freshCampaign() {
  const { campaign, run } = await svc.createCampaign(SAMPLE_BRIEF);
  await run!.completion;
  return svc.getCampaign(campaign.id);
}

describe("end-to-end workflow (demo mode)", () => {
  it("validates the brief and reports missing fields", async () => {
    await expect(svc.createCampaign({ ...SAMPLE_BRIEF, name: "", images: [] })).rejects.toMatchObject({ status: 422, fieldErrors: { name: expect.any(String), images: expect.any(String) } });
  });

  it("applies only approved changes and keeps everything else traceable", async () => {
    const c = await freshCampaign();
    expect(c.currentVersion).toBe(1);
    const pending = c.proposals.filter((p) => p.status === "pending");
    expect(pending.length).toBeGreaterThan(15);

    const blocked = pending.find((p) => p.validation.status === "blocked")!;
    await expect(svc.decideProposal(c.id, blocked.id, { action: "approve" })).rejects.toMatchObject({ status: 422 });

    const { approved } = await svc.approveRecommended(c.id);
    expect(approved).toBeGreaterThan(10);
    const toReject = (await svc.getCampaign(c.id)).proposals.find((p) => p.status === "approved" && p.field === "social.linkedin")!;
    await svc.decideProposal(c.id, toReject.id, { action: "reject", note: "Too long for LinkedIn" });

    const before = (await svc.getCampaign(c.id));
    const res = await svc.applyChanges(c.id);
    expect(res.version).toBe(2);
    const after = (await svc.getCampaign(c.id));
    const v2 = after.versions.find((v) => v.number === 2)!.content;
    for (const p of before.proposals.filter((x) => x.status === "approved")) expect(getField(v2, p.field)).toEqual(p.editedValue ?? p.proposedValue);
    expect(v2.social.linkedin).toBe("");
    expect(after.versions.find((v) => v.number === 1)!.content.landing.heroHeadline).toBe("Casa Tezontle");
    expect(after.changelog.filter((l) => l.version === 2)).toHaveLength(res.applied);
    expect(after.proposals.find((p) => p.id === toReject.id)!.status).toBe("rejected");
    expect(after.qa!.regression.every((r) => r.passed)).toBe(true);
  });

  it("gates campaign approval on critical QA issues", async () => {
    const c = await freshCampaign();
    expect(canApproveCampaign(c).ok).toBe(false);
    await svc.approveRecommended(c.id);
    await svc.applyChanges(c.id);
    const mid = (await svc.getCampaign(c.id));
    // Only "passed" proposals were bulk-approved, so required fields with warnings may still be open.
    for (const p of mid.proposals.filter((x) => x.status === "pending" && x.validation.status !== "blocked")) await svc.decideProposal(c.id, p.id, { action: "approve" }).catch(() => undefined);
    await svc.applyChanges(c.id).catch(() => undefined);
    const ready = (await svc.getCampaign(c.id));
    const crit = ready.qa!.issues.filter((i) => i.severity === "critical");
    expect(crit).toEqual([]);
    await svc.approveCampaign(c.id);
    expect((await svc.getCampaign(c.id)).approval?.version).toBe(ready.currentVersion);
  });

  it("runs a context-aware iteration that reuses unaffected agents", async () => {
    const c = await freshCampaign();
    await svc.approveRecommended(c.id);
    await svc.applyChanges(c.id);
    const { completion, iteration } = await svc.startRun(c.id, { feedback: "Make the copy more concise and emphasize the wine room." });
    await completion;
    expect(iteration).toBe(2);
    const run = (await svc.getCampaign(c.id)).runs[1];
    expect(run.agents.audience.status).toBe("reused");
    expect(run.agents.market.status).toBe("reused");
    expect(run.agents.copy.errors, JSON.stringify(Object.values(run.agents).map((a) => [a.agentId, a.status, a.errors]))).toEqual([]);
    expect(run.agents.copy.status).toBe("completed");
    expect(run.agents.facts.status).toBe("completed");
    expect(run.agents.qa.status).toBe("completed");
    const copy = run.agents.copy.output as { features: { title: string }[]; listingCopy: string; includedUserClaims: string[] };
    expect(copy.features[0].title.toLowerCase()).toContain("wine");
    expect(copy.includedUserClaims).toEqual([]);
    const iter2 = (await svc.getCampaign(c.id)).proposals.filter((p) => p.runId === run.id);
    expect(iter2.length).toBeGreaterThan(0);
    expect(iter2.every((p) => p.iteration === 2)).toBe(true);
  });

  it("restores an earlier version non-destructively", async () => {
    const c = await freshCampaign();
    await svc.approveRecommended(c.id);
    await svc.applyChanges(c.id);
    const { version } = await svc.restore(c.id, 1);
    const after = (await svc.getCampaign(c.id));
    expect(version).toBe(3);
    expect(after.versions).toHaveLength(3);
    expect(after.versions[2].content).toEqual(after.versions[0].content);
    expect(after.changelog.some((l) => l.approval === "restored")).toBe(true);
  });

  it("derives metrics from recorded events only", async () => {
    const m = computeMetrics((await svc.listCampaigns()), (await svc.listEvents()));
    expect(m.timeToFirstDraftMs).not.toBeNull();
    expect(m.agents.find((a) => a.agentId === "copy")!.completed).toBeGreaterThan(0);
    expect(m.firstPassApprovalRate).toBeGreaterThan(0);
    expect(m.approvedCampaigns).toBe(1);
  });
});
