import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";

/** Minimal in-memory implementation of the Upstash REST commands the store uses. */
function fakeUpstash() {
  const kv = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();
  let calls = 0;
  const exec = (cmd: (string | number)[]): unknown => {
    calls++;
    const [op, key, ...a] = cmd.map(String);
    switch (op) {
      case "GET": return kv.get(key) ?? null;
      case "SET": {
        const nx = a.includes("NX");
        if (nx && kv.has(key)) return null;
        kv.set(key, a[0]);
        return "OK";
      }
      case "MGET": return [key, ...a].map((k) => kv.get(k) ?? null);
      case "DEL": return kv.delete(key) ? 1 : 0;
      case "SADD": (sets.get(key) ?? sets.set(key, new Set()).get(key)!).add(a[0]); return 1;
      case "SREM": return sets.get(key)?.delete(a[0]) ? 1 : 0;
      case "SMEMBERS": return [...(sets.get(key) ?? [])];
      case "RPUSH": (lists.get(key) ?? lists.set(key, []).get(key)!).push(...a); return lists.get(key)!.length;
      case "LTRIM": { const l = lists.get(key) ?? []; lists.set(key, l.slice(Number(a[0]) < 0 ? Math.max(0, l.length + Number(a[0])) : Number(a[0]))); return "OK"; }
      case "LRANGE": return lists.get(key) ?? [];
      default: throw new Error(`unsupported ${op}`);
    }
  };
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const cmd = JSON.parse(String(init.body));
    expect(url).toBe("https://fake.upstash.io");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    return new Response(JSON.stringify({ result: exec(cmd) }), { status: 200 });
  });
  return { fetchMock, kv, calls: () => calls };
}

describe("Redis (Upstash REST) store backend", () => {
  const fake = fakeUpstash();
  const realFetch = globalThis.fetch;
  let svc: typeof import("@/lib/server/campaigns");
  let storeMod: typeof import("@/lib/server/store");

  beforeAll(async () => {
    process.env.KV_REST_API_URL = "https://fake.upstash.io";
    process.env.KV_REST_API_TOKEN = "test-token";
    globalThis.fetch = fake.fetchMock as unknown as typeof fetch;
    storeMod = await import("@/lib/server/store");
    svc = await import("@/lib/server/campaigns");
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("selects the redis backend from Vercel's KV env vars", () => {
    expect(storeMod.store().kind).toBe("redis");
    expect(storeMod.uploadsEnabled()).toBe(false);
  });

  it("runs the full workflow and seeding against Redis", async () => {
    await svc.ensureExamples();
    expect(await svc.listCampaigns()).toHaveLength(5);
    const { campaign, run } = await svc.createCampaign(SAMPLE_BRIEF);
    await run!.completion;
    await svc.approveRecommended(campaign.id);
    const { version } = await svc.applyChanges(campaign.id);
    expect(version).toBe(2);
    const c = await svc.getCampaign(campaign.id);
    expect(c.runs[0].status).toBe("completed");
    expect(Object.values(c.runs[0].agents).every((a) => a.status === "completed")).toBe(true);
    expect((await svc.listEvents()).some((e) => e.name === "changes_applied" && e.campaignId === campaign.id)).toBe(true);
    await svc.deleteCampaign(campaign.id);
    expect(await svc.findCampaign(campaign.id)).toBeNull();
    expect([...fake.kv.keys()].some((k) => k.startsWith("presenceos:lock:"))).toBe(false);
  });

  it("serialises concurrent writers with the distributed lock", async () => {
    const s = storeMod.store();
    const order: string[] = [];
    await Promise.all(
      ["a", "b", "c"].map((id) =>
        s.withLock("same", async () => {
          order.push(`start-${id}`);
          await new Promise((r) => setTimeout(r, 15));
          order.push(`end-${id}`);
        }),
      ),
    );
    for (let i = 0; i < order.length; i += 2) expect(order[i].replace("start", "end")).toBe(order[i + 1]);
  });
});
