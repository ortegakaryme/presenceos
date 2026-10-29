import type { z } from "zod";
import type {
  AcceptanceResult,
  AgentId,
  CampaignContent,
  FieldValue,
  Proposal,
  PropertyBrief,
} from "@/lib/domain/schemas";
import type { FieldPath } from "@/lib/domain/fields";
import type { FeedbackDirectives } from "./feedback";

/** What every specialist receives from the Builder. Specialists never touch shared state. */
export interface AgentContext {
  brief: PropertyBrief;
  iteration: number;
  /** Latest human-approved campaign content — iterations build on this, not on a blank slate. */
  current: CampaignContent;
  feedback: FeedbackDirectives;
  /** Validated outputs of upstream agents (this run, or reused from an earlier run). */
  upstream: Partial<Record<AgentId, unknown>>;
  /** Proposals humans rejected in earlier iterations — agents avoid re-proposing them. */
  rejected: { field: string; value: FieldValue; agentId: string; note?: string }[];
  /** Proposals drafted earlier in this run (provided to QA only). */
  drafted: Proposal[];
}

/** A proposed change before the Builder assigns ids, current values and validation. */
export interface ProposalDraft {
  field: FieldPath;
  value: FieldValue;
  rationale: string;
  evidence: string[];
  correctsField?: { agentId: AgentId; field: FieldPath };
}

export interface AgentDefinition<I = unknown, O = unknown> {
  id: AgentId;
  number: string;
  name: string;
  purpose: string;
  dependsOn: AgentId[];
  /**
   * "llm": calls the model in model mode, deterministic generator in demo mode.
   * "rule": deterministic in every mode (e.g. the facts ledger must not be model-generated).
   */
  kind: "llm" | "rule";
  acceptanceCriteria: string[];
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  task(ctx: AgentContext): string;
  buildInput(ctx: AgentContext): I;
  demo(input: I, ctx: AgentContext): O;
  /** System instructions used in model mode. */
  instructions: string;
  accept(output: O, input: I, ctx: AgentContext): AcceptanceResult[];
  proposals(output: O, input: I, ctx: AgentContext): ProposalDraft[];
  summarize(output: O): string;
}

export interface BaseOutput {
  summary: string;
  rationale: string;
  warnings: string[];
  assumptions: string[];
}
