import type { AgentId } from "@/lib/domain/schemas";
import type { AgentDefinition } from "./types";
import { audienceAgent } from "./specialists/audience";
import { marketAgent } from "./specialists/market";
import { factsAgent } from "./specialists/facts";
import { brandAgent } from "./specialists/brand";
import { positioningAgent } from "./specialists/positioning";
import { copyAgent } from "./specialists/copy";
import { visualAgent } from "./specialists/visual";
import { socialAgent } from "./specialists/social";
import { uxAgent } from "./specialists/ux";
import { seoAgent } from "./specialists/seo";
import { qaAgent } from "./specialists/qa";
import { analyticsAgent } from "./specialists/analytics";

export const AGENTS: Record<AgentId, AgentDefinition> = {
  audience: audienceAgent as AgentDefinition,
  market: marketAgent as AgentDefinition,
  facts: factsAgent as AgentDefinition,
  brand: brandAgent as AgentDefinition,
  positioning: positioningAgent as AgentDefinition,
  copy: copyAgent as AgentDefinition,
  visual: visualAgent as AgentDefinition,
  social: socialAgent as AgentDefinition,
  ux: uxAgent as AgentDefinition,
  seo: seoAgent as AgentDefinition,
  qa: qaAgent as AgentDefinition,
  analytics: analyticsAgent as AgentDefinition,
};

export const AGENT_ORDER = Object.keys(AGENTS) as AgentId[];

/** Agents that depend (directly or transitively) on any agent in `ids`, including `ids`. */
export function downstreamClosure(ids: AgentId[]): Set<AgentId> {
  const out = new Set<AgentId>(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of AGENT_ORDER) {
      if (!out.has(a) && AGENTS[a].dependsOn.some((d) => out.has(d))) {
        out.add(a);
        grew = true;
      }
    }
  }
  return out;
}

/** Topological "waves" — agents in the same wave can run in parallel. Used for display. */
export function dependencyWaves(): AgentId[][] {
  const depth = new Map<AgentId, number>();
  const d = (id: AgentId): number => {
    if (depth.has(id)) return depth.get(id)!;
    const v = AGENTS[id].dependsOn.length ? 1 + Math.max(...AGENTS[id].dependsOn.map(d)) : 0;
    depth.set(id, v);
    return v;
  };
  AGENT_ORDER.forEach(d);
  const waves: AgentId[][] = [];
  for (const id of AGENT_ORDER) (waves[depth.get(id)!] ??= []).push(id);
  return waves;
}
