"use client";

import { useMemo, useState } from "react";
import { useCampaign } from "@/lib/client/CampaignContext";
import { agentsForFeedback, interpretFeedback } from "@/lib/agents/feedback";
import { AGENTS, AGENT_ORDER, downstreamClosure } from "@/lib/agents/registry";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, inputClass } from "./ui";

export function IterationPanel() {
  const { campaign: c, act, busy, running } = useCampaign();
  const [text, setText] = useState("");
  const plan = useMemo(() => {
    if (!text.trim()) return null;
    const d = interpretFeedback([...c.feedbackHistory.map((f) => f.text), text]);
    const set = new Set([...downstreamClosure(agentsForFeedback(d)), "facts", "qa"]);
    return { d, agents: AGENT_ORDER.filter((a) => set.has(a)) };
  }, [text, c.feedbackHistory]);
  const pending = c.proposals.filter((p) => p.status === "pending").length;
  const unapplied = c.proposals.filter((p) => p.status === "approved").length;

  return (
    <Card className="p-5">
      <p className="eyebrow text-taupe">Phase 9 · Next iteration</p>
      <h2 className="font-display mt-1 text-2xl text-ink">Request another round</h2>
      <p className="mt-1 text-sm text-stone">Agents build on the approved v{c.currentVersion}, your previous feedback and rejected proposals. Only affected agents rerun.</p>
      <label htmlFor="feedback" className="sr-only">Feedback for the next iteration</label>
      <textarea id="feedback" rows={3} className={`${inputClass} mt-4`} placeholder="e.g. Make the copy more concise and emphasise the wine room. Try a warmer tone on social." value={text} onChange={(e) => setText(e.target.value)} />
      {plan && (
        <div className="mt-3 text-xs text-stone">
          <p>
            Builder plan: rerun {plan.agents.length} of 12 agents —{" "}
            {plan.agents.map((a) => (
              <Badge key={a} className="mr-1 mt-1">{AGENTS[a].number} {AGENTS[a].name}</Badge>
            ))}
          </p>
          <p className="mt-1.5">
            Interpreted as: {[plan.d.concise && "more concise", plan.d.warmer && "warmer tone", plan.d.moreFormal && "more formal", plan.d.seoFocus && "SEO focus", plan.d.emphasis.length && `emphasise “${plan.d.emphasis.join("”, “")}”`, plan.d.focus.length && `focus: ${plan.d.focus.join(", ")}`].filter(Boolean).join(" · ") || "general revision"}
          </p>
        </div>
      )}
      {(pending > 0 || unapplied > 0) && <p className="mt-3 text-xs text-warn">{pending} undecided proposals will be kept as “stale”{unapplied ? `; apply your ${unapplied} approved changes first or they stay approved but unapplied` : ""}.</p>}
      <Button className="mt-4" disabled={!text.trim() || running || !!busy} onClick={async () => { const r = await act("iterate", () => api(`/api/campaigns/${c.id}/runs`, { body: { feedback: text } })); if (r) setText(""); }}>
        {running ? "Agents running…" : "Start iteration"}
      </Button>
    </Card>
  );
}
