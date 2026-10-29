import { z } from "zod";
import type { AgentDefinition } from "../types";
import { baseOutputShape, SHARED_RULES } from "./base";
import { criterion, keyFacts } from "../helpers";

const Input = z.object({
  targetBuyer: z.string(),
  place: z.string(),
  price: z.string(),
  verifiedAmenities: z.array(z.string()),
  channels: z.array(z.string()),
});
const Segment = z.object({
  name: z.string(),
  description: z.string(),
  motivations: z.array(z.string()),
  needs: z.array(z.string()),
  messagingImplications: z.array(z.string()),
  basis: z.enum(["brief", "assumption"]),
});
const Output = z.object({ ...baseOutputShape, segments: z.array(Segment), primarySegment: z.string() });
export type AudienceOutput = z.infer<typeof Output>;

const MOTIVATION_MAP: { re: RegExp; motivation: string; implication: string }[] = [
  { re: /garden|terrace|landscape/i, motivation: "Private outdoor space within the city", implication: "Lead with the garden and terraces as everyday living space." },
  { re: /office|library|study/i, motivation: "A considered place to work from home", implication: "Present the library and office as quiet, separate rooms." },
  { re: /wine|kitchen|entertain/i, motivation: "Hosting at home", implication: "Show the kitchen and wine room as an entertaining sequence." },
  { re: /staff|service/i, motivation: "Discreet household operations", implication: "Mention staff quarters and service kitchen factually and briefly." },
  { re: /solar|rainwater|sustainab/i, motivation: "Lower operating footprint", implication: "State sustainability systems plainly; do not quantify savings." },
  { re: /renovat|architect|double-height/i, motivation: "Architectural character without a renovation project", implication: "Emphasise the completed renovation and the architecture." },
  { re: /ocean|\bsea\b|\bbay\b|view|beach|lagoon/i, motivation: "A daily connection to the water", implication: "Lead with the views, described exactly as documented." },
  { re: /pool|jacuzzi|palapa|deck/i, motivation: "Outdoor living and entertaining", implication: "Show the pool and terraces as places to gather." },
  { re: /concierge|elevator|gym|spa|controlled access/i, motivation: "Lock-and-leave convenience", implication: "State building services plainly; they matter to part-time residents." },
];

export const audienceAgent: AgentDefinition<z.infer<typeof Input>, AudienceOutput> = {
  id: "audience",
  number: "01",
  name: "Audience Research",
  purpose: "Identifies buyer segments, motivations, needs and messaging implications from the brief.",
  dependsOn: [],
  kind: "llm",
  acceptanceCriteria: [
    "At least two buyer segments",
    "Every segment has motivations and messaging implications",
    "Primary segment is one of the segments",
    "Segments not stated in the brief are labelled as assumptions",
  ],
  inputSchema: Input,
  outputSchema: Output,
  task: () => "Segmenting buyers from the target-buyer brief and verified amenities",
  buildInput: (ctx) => {
    const f = keyFacts(ctx.brief);
    return { targetBuyer: ctx.brief.targetBuyer, place: f.place, price: f.price, verifiedAmenities: ctx.brief.verifiedAmenities, channels: ctx.brief.channels };
  },
  demo: (input) => {
    const [who, seeking = ""] = input.targetBuyer.split(/\b(?:seeking|looking for|who want|wanting)\b/i);
    const groups = who.split(/,|\band\b/i).map((s) => s.trim()).filter((s) => s.length > 2);
    const needs = seeking.replace(/within .*$/i, "").split(/,|\band\b/i).map((s) => s.trim().replace(/\.$/, "")).filter(Boolean);
    const matched = MOTIVATION_MAP.filter((m) => input.verifiedAmenities.some((a) => m.re.test(a)));
    const segments: AudienceOutput["segments"] = groups.map((g, i) => {
      const share = matched.filter((_, j) => j % groups.length === i % groups.length);
      const mine = share.length ? share : matched.slice(0, 2);
      return {
        name: g.charAt(0).toUpperCase() + g.slice(1),
        description: `Stated in the brief as a target buyer for ${input.place}.`,
        motivations: mine.map((m) => m.motivation).slice(0, 3),
        needs: needs.length ? needs : ["Not specified in the brief"],
        messagingImplications: mine.map((m) => m.implication).slice(0, 3),
        basis: "brief",
      };
    });
    if (matched.some((m) => /architect/i.test(m.motivation)) || segments.length < 2) {
      segments.push({
        name: "Design-literate buyers",
        description: "Inferred from the architectural features of the property — not stated in the brief.",
        motivations: ["Architectural character", "Completed, considered renovation"],
        needs: ["Clear photography of spaces and light", "Accurate floor areas"],
        messagingImplications: ["Use precise, editorial language; let the architecture lead."],
        basis: "assumption",
      });
    }
    return {
      summary: `${segments.length} segments identified; primary segment: ${segments[0]?.name ?? "—"}.`,
      rationale: `Segments come from the target-buyer brief; motivations are mapped from ${matched.length} verified amenities.`,
      warnings: segments.length < 2 ? ["Brief describes fewer than two buyer groups."] : [],
      assumptions: segments.filter((s) => s.basis === "assumption").map((s) => `${s.name} is an inferred segment.`),
      segments,
      primarySegment: segments[0]?.name ?? "",
    };
  },
  instructions: `You are Agent 01, Audience Research, for a luxury real-estate marketing studio.
Identify likely buyer segments, their motivations and needs, and the messaging implications for this property.
Use the target-buyer brief and verified amenities. Any segment not stated in the brief must have basis "assumption". No demographic stereotyping.
${SHARED_RULES}`,
  accept: (o) => [
    criterion("At least two buyer segments", o.segments.length >= 2, `${o.segments.length} segments`),
    criterion("Every segment has motivations and messaging implications", o.segments.every((s) => s.motivations.length > 0 && s.messagingImplications.length > 0)),
    criterion("Primary segment is one of the segments", o.segments.some((s) => s.name === o.primarySegment)),
    criterion("Segments not stated in the brief are labelled as assumptions", o.segments.every((s) => s.basis === "brief" || s.basis === "assumption")),
  ],
  proposals: () => [],
  summarize: (o) => o.summary,
};
