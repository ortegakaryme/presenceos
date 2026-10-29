"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCampaign } from "@/lib/client/CampaignContext";
import { STAGE_LABEL, criticalOpen, stageOf } from "@/lib/domain/stage";
import { Badge, Button, buttonClass, cx, Notice, type Tone } from "./ui";
import { DeleteCampaignButton } from "./CampaignActions";

const STAGE_TONE: Record<string, Tone> = { intake: "neutral", running: "info", review: "warn", blocked: "bad", ready: "ok", approved: "dark" };

export function CampaignHeader() {
  const { campaign: c, running, error, clearError } = useCampaign();
  const path = usePathname();
  const stage = stageOf(c);
  const pending = c.proposals.filter((p) => p.status === "pending").length;
  const approved = c.proposals.filter((p) => p.status === "approved").length;
  const crit = criticalOpen(c);
  const run = c.runs[c.runs.length - 1];
  const doneAgents = run ? Object.values(run.agents).filter((a) => ["completed", "reused", "failed", "skipped"].includes(a.status)).length : 0;
  const tabs = [
    { href: "agents", label: "Agents", count: running ? `${doneAgents}/12` : undefined },
    { href: "studio", label: "Studio" },
    { href: "review", label: "Review", count: pending + approved ? String(pending + approved) : undefined },
    { href: "qa", label: "Quality", count: crit ? String(crit) : undefined, bad: crit > 0 },
    { href: "history", label: "History", count: `v${c.currentVersion}` },
  ];
  return (
    <div className="border-b border-line bg-paper/60">
      <div className="mx-auto max-w-[88rem] px-4 pt-8 md:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow mb-2 text-taupe">
              {c.brief.neighborhood} · {c.brief.city}
              {c.brief.isFictional && <span className="ml-2 text-stone">· Fictional demo property</span>}
              {c.origin === "example" && <span className="ml-2 text-stone">· Preloaded example</span>}
            </p>
            <h1 className="font-display text-4xl leading-none text-ink md:text-5xl">{c.brief.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone">
              <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
              <span>Version {c.currentVersion}</span>
              <span aria-hidden>·</span>
              <span>Iteration {c.runs.length}</span>
              {c.approval && <span className="text-ok">· v{c.approval.version} approved</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DeleteCampaignButton id={c.id} name={c.brief.name} redirectTo="/" />
            <a href={`/p/${c.id}?view=draft`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              Draft preview ↗
            </a>
            <a href={`/p/${c.id}`} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>
              Live page ↗
            </a>
          </div>
        </div>
        <nav aria-label="Campaign" className="-mb-px mt-7 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = path.endsWith(`/${t.href}`);
            return (
              <Link key={t.href} href={`/campaigns/${c.id}/${t.href}`} aria-current={active ? "page" : undefined} className={cx("flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm transition-colors", active ? "border-ink text-ink" : "border-transparent text-stone hover:text-ink")}>
                {t.label}
                {t.count && <span className={cx("rounded-[2px] px-1.5 text-[0.65rem] leading-4", t.bad ? "bg-bad-soft text-bad" : "bg-sand text-umber")}>{t.count}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
      {error && (
        <div className="mx-auto max-w-[88rem] px-4 pb-4 md:px-8">
          <Notice tone="bad" title="Action not completed">
            <div className="flex items-start justify-between gap-4">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={clearError}>
                Dismiss
              </Button>
            </div>
          </Notice>
        </div>
      )}
    </div>
  );
}
