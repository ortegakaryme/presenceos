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

describe("seeding and deletion", () => {
  let svc: typeof import("@/lib/server/campaigns");
  beforeAll(async () => {
    process.env.PRESENCE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "presenceos-seed-"));
    svc = await import("@/lib/server/campaigns");
  });

  it("seeds five labelled examples once, and does not re-add deleted ones", async () => {
    await svc.ensureExamples();
    const cs = (await svc.listCampaigns());
    expect(cs).toHaveLength(5);
    expect(cs.every((c) => c.origin === "example")).toBe(true);
    const applied = cs.filter((c) => c.currentVersion === 2);
    expect(applied).toHaveLength(4);
    for (const c of applied) expect(c.changelog.filter((l) => l.version === 2).every((l) => l.approval === "example_seed")).toBe(true);
    expect(cs.find((c) => c.brief.name === "Casa Tezontle")!.currentVersion).toBe(1);

    await svc.deleteCampaign(cs[0].id);
    await svc.ensureExamples();
    expect((await svc.listCampaigns())).toHaveLength(4);
    expect(await svc.seedExamples()).toBe(1);
    expect((await svc.listCampaigns())).toHaveLength(5);
  });

  it("excludes seed activity from workflow metrics", async () => {
    const m = computeMetrics((await svc.listCampaigns()), (await svc.listEvents()));
    expect(m.campaigns).toBe(0);
    expect(m.exampleCampaigns).toBe(5);
    expect(m.timeToFirstDraftMs).toBeNull();
    expect(m.agents.every((a) => a.started === 0)).toBe(true);
    expect(m.perCampaign).toHaveLength(5);
  });
});
