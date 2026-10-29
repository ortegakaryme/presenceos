import { z } from "zod";
import type { AgentContext } from "../types";
import type { AgentId } from "@/lib/domain/schemas";

export const baseOutputShape = {
  summary: z.string().describe("One or two sentences summarising the output."),
  rationale: z.string().describe("Concise reasoning summary with the key evidence. Not a step-by-step transcript."),
  warnings: z.array(z.string()),
  assumptions: z.array(z.string()).describe("Anything not grounded in the supplied brief, labelled as an assumption."),
};

/** Reads a validated upstream output. Throws if the dependency did not produce one. */
export function upstream<T>(ctx: AgentContext, id: AgentId): T {
  const out = ctx.upstream[id];
  if (out == null) throw new Error(`Missing upstream output from "${id}"`);
  return out as T;
}

export const SHARED_RULES = `Rules that apply to every PresenceOS agent:
- Ground every factual statement in the supplied property facts. Verified amenities and structured facts are the only source of truth.
- Items under "claimsToVerify" and statements in the free-text description are user-provided claims, not verified facts. Do not present them as fact.
- Never invent statistics, market data, testimonials, awards, certifications, views, amenities or exclusivity claims.
- Label anything not grounded in the brief as an assumption.
- Describe the property, not who the buyer should be (avoid "perfect for families" and similar).
- Return concise rationales and evidence, not a step-by-step chain of thought.`;
