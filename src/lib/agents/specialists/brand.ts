import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES, upstream } from "./base";
import { criterion } from "../helpers";
import type { AudienceOutput } from "./audience";
import type { MarketOutput } from "./market";

const Input = z.object({
  brandVoice: z.string(),
  tone: z.array(z.string()),
  language: z.string(),
  primarySegment: z.string(),
  differentiators: z.array(z.string()),
  warmer: z.boolean(),
  moreFormal: z.boolean(),
});
const Output = z.object({
  ...baseOutputShape,
  voice: z.string(),
  toneWords: z.array(z.string()),
  doList: z.array(z.string()),
  avoidTerms: z.array(z.string()),
  visualDirection: z.string(),
  ctaLabel: z.string(),
  guardrails: z.array(z.string()),
});
export type BrandOutput = z.infer<typeof Output>;

const DEFAULT_AVOID = ["stunning", "must-see", "dream home", "nestled", "boasts", "exclamation marks"];

export const brandAgent: AgentDefinition<z.infer<typeof Input>, BrandOutput> = {
  id: "brand",
  number: "04",
  name: "Luxury Brand Strategist",
  purpose: "Defines brand voice, tone, visual direction, messaging rules and creative guardrails.",
  dependsOn: ["audience", "market"],
  kind: "llm",
  acceptanceCriteria: [
    "Voice statement is defined",
    "At least three guardrails, including an explicit 'Avoid' list",
    "At least three terms to avoid",
    "CTA label contains no urgency language",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: (ctx) => (ctx.iteration > 1 ? "Revisiting voice and guardrails against feedback" : "Defining voice, guardrails and CTA tone"),
  buildInput: (ctx) => {
    const a = upstream<AudienceOutput>(ctx, "audience");
    const m = upstream<MarketOutput>(ctx, "market");
    return {
      brandVoice: ctx.brief.brandVoice,
      tone: ctx.brief.tone,
      language: ctx.brief.language,
      primarySegment: a.primarySegment,
      differentiators: m.differentiators,
      warmer: ctx.feedback.warmer,
      moreFormal: ctx.feedback.moreFormal,
    };
  },
  demo: (input) => {
    const toneWords = [...input.tone, ...(input.warmer ? ["hospitable"] : []), ...(input.moreFormal ? ["measured"] : [])];
    const voice = `${input.brandVoice}. Register: ${toneWords.slice(0, 3).join(", ")}. Short declarative sentences, concrete nouns, no hype. ${
      input.warmer ? "Allow a little warmth — describe how rooms are lived in, not only how they look." : "Let the architecture and verified details carry the sense of luxury."
    }`;
    const guardrails = [
      "Lead with architecture, light and landscape; let verified facts carry the luxury.",
      "State only verified facts. Never imply amenities, views, awards or exclusivity that are not documented.",
      "Describe the space, never the buyer.",
      "No urgency or scarcity tactics; viewings are by appointment.",
      `Avoid these words: ${DEFAULT_AVOID.join(", ")}`,
    ];
    return {
      summary: `Voice: ${toneWords.slice(0, 3).join(" · ")}. ${guardrails.length} guardrails, ${DEFAULT_AVOID.length} banned terms.`,
      rationale: `Derived from the requested voice ("${input.brandVoice}") and the primary segment (${input.primarySegment}); quiet-luxury buyers respond to precision over superlatives.`,
      warnings: input.language !== "en" ? ["Demo templates are English-only; set ANTHROPIC_API_KEY for other languages."] : [],
      assumptions: ["Quiet-luxury positioning favours restraint — a category convention, not tested data."],
      voice,
      toneWords,
      doList: ["Use precise measurements", "Name materials and light", "Keep CTAs calm and specific"],
      avoidTerms: DEFAULT_AVOID,
      visualDirection: "Editorial, natural light, wide architectural frames first; interiors as quiet details. No heavy filters.",
      ctaLabel: "Request a private viewing",
      guardrails,
    };
  },
  instructions: `You are Agent 04, Luxury Brand Strategist.
Define the brand voice, tone words, do/avoid lists, visual direction, a calm CTA label and creative guardrails.
Include one guardrail that starts with "Avoid these words:" followed by a comma-separated list. The CTA must not use urgency.
${SHARED_RULES}`,
  accept: (o) => [
    criterion("Voice statement is defined", o.voice.trim().length > 20),
    criterion("At least three guardrails, including an explicit 'Avoid' list", o.guardrails.length >= 3 && o.guardrails.some((g) => /^avoid/i.test(g))),
    criterion("At least three terms to avoid", o.avoidTerms.length >= 3),
    criterion("CTA label contains no urgency language", !/\b(now|today|hurry|fast|last chance)\b/i.test(o.ctaLabel), o.ctaLabel),
  ],
  proposals: (o) => [
    { field: "brand.voice", value: o.voice, rationale: o.rationale, evidence: ["Brief · brand voice", "Agent 01 · primary segment"] },
    { field: "brand.guardrails", value: o.guardrails, rationale: "Guardrails make the voice enforceable: QA checks copy against the 'Avoid' list.", evidence: ["Brief · tone"] },
    { field: "landing.ctaLabel", value: o.ctaLabel, rationale: "A calm, appointment-based CTA matches quiet-luxury expectations and avoids urgency.", evidence: ["Brand guardrail · no urgency"] },
  ],
  summarize: (o) => o.summary,
};
