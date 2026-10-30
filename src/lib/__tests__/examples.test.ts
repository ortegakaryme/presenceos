import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseListing } from "@/lib/intake/parse";
import { CASA_UMBRAL_TEXT, EXAMPLES, briefFromListing } from "@/lib/domain/examples";
import { PropertyBriefSchema } from "@/lib/domain/schemas";
import { AGENT_ORDER } from "@/lib/agents/registry";
import { NO_FEEDBACK } from "@/lib/agents/feedback";
import { baselineContent } from "@/lib/builder/baseline";
import { demoExecutor, runPipeline } from "@/lib/builder/orchestrator";
import { computeMetrics } from "@/lib/analytics/metrics";

describe("listing parser", () => {
  const r = parseListing(CASA_UMBRAL_TEXT);
  it("extracts structured facts from a Spanish listing", () => {
    expect(r.brief).toMatchObject({
      name: "Casa Umbral",
      neighborhood: "Avándaro",
      city: "Valle de Bravo",
      country: "Mexico",
      price: { amount: 38_500_000, currency: "MXN" },
      landArea: 1850,
      interiorArea: 620,
      bedrooms: 5,
      bathrooms: 6.5,
      parkingSpaces: 4,
      propertyType: "house",
      isFictional: true,
    });
    expect(r.isSpanish).toBe(true);
    expect(r.setting).toBe("forest");
  });
  it("translates amenities and keeps the prose as user-provided description", () => {
    const a = r.brief.verifiedAmenities!;
    expect(a).toEqual(expect.arrayContaining(["Heated pool and jacuzzi", "Covered terrace and wooded garden", "Separate study", "Double-height living room"]));
    expect(a.some((x) => /precio|terreno|rec[aá]maras/i.test(x))).toBe(false);
    expect(r.brief.description).toMatch(/^Enclavada entre los bosques/);
    expect(r.brief.description).not.toMatch(/Características|ficticios/);
  });
  it("parses English listings too", () => {
    const e = parseListing("# Villa Test\n**Beachfront villa in Playa Norte, Tulum**\n\n- Price: USD 2.4 million\n- 4 bedrooms\n- 3 full baths\n- 1 half bath\n- Lot: 800 m²\n- Interior: 450 m²\n- Infinity pool");
    expect(e.brief).toMatchObject({ name: "Villa Test", neighborhood: "Playa Norte", city: "Tulum", propertyType: "villa", bedrooms: 4, bathrooms: 3.5, landArea: 800, interiorArea: 450, price: { amount: 2_400_000, currency: "USD" } });
    expect(e.setting).toBe("beach");
  });
  it("produces a complete, valid brief with defaults and stock photos", () => {
    expect(PropertyBriefSchema.safeParse(briefFromListing(CASA_UMBRAL_TEXT)).success).toBe(true);
  });
});

describe("example campaigns", () => {
  it.each(EXAMPLES.map((e) => [e.label, e] as const))("%s: brief is valid and all agents complete", async (_l, ex) => {
    const brief = PropertyBriefSchema.parse(ex.brief);
    const r = await runPipeline({ runId: "r", iteration: 1, brief, current: baselineContent(brief), feedback: NO_FEEDBACK, rejected: [], plan: [...AGENT_ORDER], reused: {}, mode: "demo", injectFailure: false, executor: demoExecutor(0) });
    for (const id of AGENT_ORDER) expect(r.records[id].errors, `${ex.label} ${id}`).toEqual([]);
    const hero = r.proposals.find((p) => p.agentId === "copy" && p.field === "landing.heroHeadline");
    expect(hero?.validation.status, String(hero?.proposedValue)).toBe("passed");
    expect(r.proposals.filter((p) => p.validation.status === "passed").length).toBeGreaterThan(12);
  });

  it("uses the property type and signature setting in headlines", async () => {
    const heroes: string[] = [];
    for (const ex of EXAMPLES) {
      const brief = PropertyBriefSchema.parse(ex.brief);
      const r = await runPipeline({ runId: "r", iteration: 1, brief, current: baselineContent(brief), feedback: NO_FEEDBACK, rejected: [], plan: [...AGENT_ORDER], reused: {}, mode: "demo", injectFailure: false, executor: demoExecutor(0) });
      heroes.push(String(r.proposals.find((p) => p.agentId === "copy" && p.field === "landing.heroHeadline")!.proposedValue));
    }
    expect(heroes).toEqual(["A Garden House in Lomas de Chapultepec", "A Woodland House in Avándaro", "An Ocean-View Villa in Conchas Chinas", "A Bay-View House in Las Brisas", "A Sea-View Penthouse in Puerto Cancún"]);
  });
});

describe("seeded examples", () => {
  let svc: typeof import("@/lib/server/campaigns");
  beforeAll(async () => {
    process.env.PRESENCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "presenceos-seed-"));
    svc = await import("@/lib/server/campaigns");
  });

  it("uses fixed ids and builds identical campaigns every time (any instance)", async () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(["casa-tezontle", "casa-umbral", "villa-marea", "casa-brisa", "penthouse-arrecife"]);
    const a = await svc.rebuildExample("casa-brisa");
    const b = await svc.rebuildExample("casa-brisa");
    expect(a.id).toBe("casa-brisa");
    expect(b.proposals.map((p) => p.id)).toEqual(a.proposals.map((p) => p.id));
    expect(b.conflicts.map((k) => k.id)).toEqual(a.conflicts.map((k) => k.id));
    expect(b.versions.map((v) => v.content)).toEqual(a.versions.map((v) => v.content));
    expect(a.currentVersion).toBe(2);
    expect(a.changelog.filter((l) => l.version === 2).every((l) => l.approval === "example_seed")).toBe(true);
  });

  it("rebuilds an example from its id on a cold store", async () => {
    const c = await svc.findCampaign("villa-marea");
    expect(c?.brief.name).toBe("Villa Marea");
    expect(await svc.findCampaign("not-a-campaign")).toBeNull();
  });

  it("stores the five examples under fixed ids and removes legacy random-id examples", async () => {
    const { store } = await import("@/lib/server/store");
    const legacy = { ...(await svc.rebuildExample("casa-umbral")), id: "cmp_legacy01" };
    await store().putCampaign(legacy);
    expect(await svc.ensureExamples()).toBe(5);
    const cs = await svc.listCampaigns();
    expect(cs.map((c) => c.id).sort()).toEqual([...EXAMPLES.map((e) => e.id)].sort());
    expect(await svc.ensureExamples()).toBe(0);
  });

  it("refuses to delete examples", async () => {
    await expect(svc.deleteCampaign("casa-tezontle")).rejects.toMatchObject({ status: 403 });
  });

  it("excludes seed activity from workflow metrics", async () => {
    const m = computeMetrics(await svc.listCampaigns(), await svc.listEvents());
    expect(m.campaigns).toBe(0);
    expect(m.exampleCampaigns).toBe(5);
    expect(m.timeToFirstDraftMs).toBeNull();
    expect(m.agents.every((a) => a.started === 0)).toBe(true);
    expect(m.perCampaign).toHaveLength(5);
  });
});
