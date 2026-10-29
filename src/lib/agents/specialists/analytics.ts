import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { criterion } from "../helpers";
import type { UxOutput } from "./ux";
import type { SeoOutput } from "./seo";
import type { CopyOutput } from "./copy";

const Input = z.object({
  sectionOrder: z.array(z.string()),
  editorialHeadline: z.string(),
  keywordHeadline: z.string(),
  channels: z.array(z.string()),
  keywords: z.array(z.string()),
});
const Output = z.object({
  ...baseOutputShape,
  events: z.array(z.object({ name: z.string(), trigger: z.string(), properties: z.array(z.string()) })),
  hypotheses: z.array(z.object({ id: z.string(), statement: z.string(), metric: z.string(), status: z.literal("proposed") })),
  experiments: z.array(z.object({ name: z.string(), variants: z.array(z.string()), primaryMetric: z.string(), guardrailMetric: z.string(), minimumSample: z.string() })),
  observedResults: z.array(z.string()).describe("Must be empty: no listing traffic exists in this environment."),
});
export type AnalyticsOutput = z.infer<typeof Output>;

export const analyticsAgent: AgentDefinition<z.infer<typeof Input>, AnalyticsOutput> = {
  id: "analytics",
  number: "12",
  name: "Analytics & Experimentation",
  purpose: "Defines listing-page events, measurable hypotheses and experiments. Distinguishes proposals from observed data.",
  dependsOn: ["copy", "ux", "seo"],
  kind: "llm",
  acceptanceCriteria: [
    "At least five events, each with a trigger",
    "Every hypothesis is marked as proposed",
    "No observed results are reported",
    "Each experiment names a primary and a guardrail metric",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Defining listing events, hypotheses and experiments (proposed, not observed)",
  buildInput: (ctx) => {
    const ux = upstream<UxOutput>(ctx, "ux");
    const seo = upstream<SeoOutput>(ctx, "seo");
    const copy = upstream<CopyOutput>(ctx, "copy");
    return { sectionOrder: ux.sectionOrder, editorialHeadline: copy.heroHeadline, keywordHeadline: seo.heroHeadline, channels: ctx.brief.channels, keywords: seo.keywords };
  },
  demo: (input) => {
    const experiments = [
      { name: "Facts-first vs gallery-first layout", variants: [`A: ${input.sectionOrder.join(" → ")}`, "B: gallery → story → facts → …"], primaryMetric: "inquiry_started / page_view", guardrailMetric: "Bounce rate", minimumSample: "Define after baseline traffic is known" },
    ];
    if (input.keywordHeadline) {
      experiments.unshift({ name: "Hero headline: editorial vs keyword-led", variants: [`A: “${input.editorialHeadline}”`, `B: “${input.keywordHeadline}”`], primaryMetric: "cta_clicked / page_view", guardrailMetric: "Time on page", minimumSample: "Define after baseline traffic is known" });
    }
    return {
      summary: `8 listing events, 3 hypotheses and ${experiments.length} experiments — all proposed; no data observed yet.`,
      rationale: "The open trade-offs from this run (headline style, section order) are the most useful things to test once the page has traffic.",
      warnings: ["Listing-page events are a tracking plan. The public demo page does not send them to any analytics service."],
      assumptions: ["Sample sizes cannot be set until baseline traffic exists."],
      events: [
        { name: "listing_page_viewed", trigger: "Public page load", properties: ["campaign_id", "version", "referrer", "utm_source"] },
        { name: "hero_cta_clicked", trigger: "Primary CTA in hero", properties: ["cta_label"] },
        { name: "gallery_opened", trigger: "First gallery interaction", properties: ["image_id"] },
        { name: "section_viewed", trigger: "Section enters viewport", properties: ["section"] },
        { name: "inquiry_started", trigger: "First focus on the inquiry form", properties: [] },
        { name: "inquiry_submitted", trigger: "Valid inquiry submitted", properties: ["channel"] },
        { name: "agent_contact_clicked", trigger: "Email or phone link", properties: ["method"] },
        { name: "social_link_landed", trigger: "Page load with utm_source from a social post", properties: input.channels.map((c) => `utm_source=${c}`) },
      ],
      hypotheses: [
        { id: "H1", statement: "Placing key facts directly under the hero increases inquiry starts among qualified visitors.", metric: "inquiry_started / listing_page_viewed", status: "proposed" },
        { id: "H2", statement: "A keyword-led hero headline increases search click-through without reducing inquiry rate.", metric: "Organic CTR; inquiry_submitted", status: "proposed" },
        { id: "H3", statement: "Calm, appointment-based CTA copy produces fewer but better-qualified inquiries than urgency copy.", metric: "inquiry_submitted → viewing booked", status: "proposed" },
      ],
      experiments,
      observedResults: [],
    };
  },
  instructions: `You are Agent 12, Analytics and Experimentation.
Define listing-page tracking events (name, trigger, properties), measurable hypotheses (status must be "proposed") and experiments with primary and guardrail metrics.
There is no traffic data in this environment: observedResults must be an empty array. Never invent conversion results or benchmarks.
${SHARED_RULES}`,
  accept: (o) => [
    criterion("At least five events, each with a trigger", o.events.length >= 5 && o.events.every((e) => e.trigger)),
    criterion("Every hypothesis is marked as proposed", o.hypotheses.every((h) => h.status === "proposed")),
    criterion("No observed results are reported", o.observedResults.length === 0),
    criterion("Each experiment names a primary and a guardrail metric", o.experiments.every((e) => e.primaryMetric && e.guardrailMetric)),
  ],
  proposals: () => [],
  summarize: (o) => o.summary,
};
