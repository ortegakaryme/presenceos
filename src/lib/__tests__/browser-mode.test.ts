import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import type { Campaign } from "@/lib/domain/schemas";

/** Simulates a Vercel deployment without Redis: the browser holds campaign state. */
describe("browser-storage mode (serverless, no shared store)", () => {
  let svc: typeof import("@/lib/server/campaigns");
  let storeMod: typeof import("@/lib/server/store");
  beforeAll(async () => {
    process.env.VERCEL = "1";
    process.env.PRESENCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "presenceos-browser-"));
    storeMod = await import("@/lib/server/store");
    svc = await import("@/lib/server/campaigns");
  });
  afterAll(() => {
    delete process.env.VERCEL;
  });

  // What a browser would do: send its copy, save what comes back.
  const local = new Map<string, Campaign>();
  async function call<T>(id: string | null, fn: () => Promise<T>) {
    const { result, state } = await svc.withBrowserState({ campaigns: id && local.has(id) ? [local.get(id)] : [] }, fn);
    for (const c of state!.campaigns) local.set(c.id, c);
    return { result, state: state! };
  }

  it("detects browser mode", () => {
    expect(storeMod.storageMode()).toBe("browser");
    expect(storeMod.uploadsEnabled()).toBe(false);
  });

  it("creates, runs, approves and applies a user campaign without storing it on the server", async () => {
    const created = await call(null, async () => {
      const { campaign, run } = await svc.createCampaign(SAMPLE_BRIEF);
      await run!.completion;
      return { id: campaign.id };
    });
    const id = created.result.id;
    expect(local.get(id)!.runs[0].status).toBe("completed");
    expect(created.state.events.some((e) => e.name === "agent_run_completed")).toBe(true);

    await call(id, () => svc.approveRecommended(id));
    const applied = await call(id, () => svc.applyChanges(id));
    expect(applied.result.version).toBe(2);
    expect(local.get(id)!.currentVersion).toBe(2);

    // Nothing about the user campaign reached the server's own store.
    expect(await storeMod.sharedStore().getCampaign(id)).toBeNull();
    // And a request without the browser's copy cannot see it (a different browser / instance).
    await expect(svc.withBrowserState({ campaigns: [] }, () => svc.getCampaign(id))).rejects.toMatchObject({ status: 404 });
  });

  it("lets a visitor change an example locally while the original stays pristine", async () => {
    const before = await svc.findCampaign("casa-tezontle");
    const p = before!.proposals.find((x) => x.status === "pending" && x.validation.status === "passed")!;
    const r = await call("casa-tezontle", () => svc.decideProposal("casa-tezontle", p.id, { action: "approve" }));
    expect(r.state.campaigns[0].proposals.find((x) => x.id === p.id)!.status).toBe("approved");
    const after = await svc.findCampaign("casa-tezontle");
    expect(after!.proposals.find((x) => x.id === p.id)!.status).toBe("pending");
  });

  it("rejects malformed browser state", async () => {
    await expect(svc.withBrowserState({ campaigns: [{ id: "x" }] }, async () => 1)).rejects.toMatchObject({ status: 400 });
  });
});

describe("example rebuild inside a held lock (cold bundle)", () => {
  it("does not deadlock when the first change to an example triggers its rebuild", async () => {
    process.env.VERCEL = "1";
    const g = globalThis as unknown as { __presenceExamples?: Map<string, unknown> };
    g.__presenceExamples?.clear(); // simulate a route bundle/instance that has never built the example
    const svc = await import("@/lib/server/campaigns");
    const built = await svc.rebuildExample("casa-umbral");
    g.__presenceExamples?.clear();
    const p = built.proposals.find((x) => x.status === "applied") ?? built.proposals[0];
    const res = await Promise.race([
      svc.withBrowserState({ campaigns: [] }, () => svc.restore("casa-umbral", 1)).then(() => "done"),
      new Promise((r) => setTimeout(() => r("timeout"), 5000)),
    ]);
    expect(res).toBe("done");
    expect(p).toBeDefined();
    delete process.env.VERCEL;
  });
});
