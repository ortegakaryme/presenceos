import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AgentDefinition } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type ExecutionMode = "demo" | "model";

/** Server-only: decides whether specialist agents call a model. */
export function resolveMode(): { mode: ExecutionMode; model: string; reason: string } {
  const model = process.env.PRESENCE_MODEL?.trim() || DEFAULT_MODEL;
  const forced = process.env.PRESENCE_MODE?.trim();
  const hasKey = !!process.env.ANTHROPIC_API_KEY?.trim();
  if (forced === "demo") return { mode: "demo", model, reason: "PRESENCE_MODE=demo" };
  if (forced === "model" && !hasKey) return { mode: "demo", model, reason: "PRESENCE_MODE=model but ANTHROPIC_API_KEY is not set — falling back to demo mode" };
  if (hasKey) return { mode: "model", model, reason: "ANTHROPIC_API_KEY detected" };
  return { mode: "demo", model, reason: "No ANTHROPIC_API_KEY configured" };
}

export class AgentExecutionError extends Error {}

/**
 * Calls Claude for one specialist with a structured-output schema.
 * The Builder re-validates the parsed output against the same schema and the agent's
 * acceptance criteria — the model's output is never trusted blindly.
 */
export async function runModelAgent(agent: AgentDefinition, input: unknown, model: string): Promise<{ output: unknown; usage: { inputTokens: number; outputTokens: number }; model: string }> {
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(agent.outputSchema) },
      system: agent.instructions,
      messages: [
        {
          role: "user",
          content: `Agent ${agent.number} · ${agent.name}\nAcceptance criteria:\n${agent.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n\nInput (JSON):\n${JSON.stringify(input, null, 2)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new AgentExecutionError("The model declined this request (refusal). No output was used.");
    if (response.stop_reason === "max_tokens") throw new AgentExecutionError("Model output was truncated at max_tokens.");
    if (response.parsed_output == null) throw new AgentExecutionError("Model response did not parse against the output schema.");
    return {
      output: response.parsed_output,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      model: response.model,
    };
  } catch (error) {
    if (error instanceof AgentExecutionError) throw error;
    if (error instanceof Anthropic.AuthenticationError) throw new AgentExecutionError("Anthropic API key was rejected (401).");
    if (error instanceof Anthropic.RateLimitError) throw new AgentExecutionError("Rate limited by the Anthropic API (429).");
    if (error instanceof Anthropic.BadRequestError) throw new AgentExecutionError(`Bad request (400): ${error.message}`);
    if (error instanceof Anthropic.APIError) throw new AgentExecutionError(`Anthropic API error ${error.status ?? ""}: ${error.message}`);
    throw new AgentExecutionError(error instanceof Error ? error.message : String(error));
  }
}
