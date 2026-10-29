import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PropertyBriefSchema } from "@/lib/domain/schemas";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import { AGENT_ORDER } from "@/lib/agents/registry";
import { NO_FEEDBACK } from "@/lib/agents/feedback";
import { baselineContent } from "@/lib/builder/baseline";
import { demoExecutor, runPipeline } from "@/lib/builder/orchestrator";
import { setField } from "@/lib/domain/fields";
import { PropertyPage } from "@/components/property/PropertyPage";

const brief = PropertyBriefSchema.parse(SAMPLE_BRIEF);

describe("public property page", () => {
  it("renders the facts-only baseline without generated copy", () => {
    const html = renderToStaticMarkup(<PropertyPage brief={brief} content={baselineContent(brief)} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Casa Tezontle");
    expect(html).toContain("MXN 89,500,000");
    expect(html).toContain("Fictional demonstration property");
    expect(html).not.toContain('id="residence"');
  });

  it("renders a campaign built from recommended proposals, in section order, without the flagged photo", async () => {
    const r = await runPipeline({ runId: "r", iteration: 1, brief, current: baselineContent(brief), feedback: NO_FEEDBACK, rejected: [], plan: [...AGENT_ORDER], reused: {}, mode: "demo", injectFailure: false, executor: demoExecutor(0) });
    let content = baselineContent(brief);
    for (const p of r.proposals) {
      if (p.status !== "pending" || p.validation.status === "blocked") continue;
      const k = r.conflicts.find((x) => x.id === p.conflictId);
      if (k && k.recommendation.proposalId !== p.id) continue;
      content = setField(content, p.field, p.proposedValue);
    }
    const html = renderToStaticMarkup(<PropertyPage brief={brief} content={content} />);
    expect(html).toContain(content.landing.heroHeadline);
    expect(html).toContain("Request a private viewing");
    expect(html).toContain('href="mailto:valeria.montes@example.com"');
    expect(html).not.toMatch(/Lower terrace with pool/);
    const order = ['aria-label="Key facts"', 'id="residence"', 'id="gallery"', 'id="features"', 'aria-label="Verified amenities"', 'id="location"', 'id="inquire"'].map((s) => html.indexOf(s));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
