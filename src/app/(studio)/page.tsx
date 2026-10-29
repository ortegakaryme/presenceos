import Link from "next/link";
import { ensureExamples, listCampaigns } from "@/lib/server/campaigns";
import { currentContent } from "@/lib/builder/apply";
import { STAGE_LABEL, criticalOpen, stageOf } from "@/lib/domain/stage";
import { EXAMPLES } from "@/lib/domain/examples";
import { SAMPLE_BRIEF } from "@/lib/domain/sample";
import { Badge, ButtonLink, EmptyState, type Tone } from "@/components/ui";
import { SafeImage } from "@/components/SafeImage";
import { QuickStart } from "@/components/QuickStart";
import { DeleteCampaignButton, RestoreExamplesButton } from "@/components/CampaignActions";
import { formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
// First visit to a fresh workspace runs the agents for the five examples.
export const maxDuration = 60;

const STAGE_TONE: Record<string, Tone> = { intake: "neutral", running: "info", review: "warn", blocked: "bad", ready: "ok", approved: "dark" };

const TIMELINE = [
  { who: "You", title: "Share the brief", phases: ["1 · Intake"], text: "Paste a listing or fill the form. Verified facts are kept apart from claims that still need proof." },
  { who: "AI agents", title: "Agents draft the campaign", phases: ["2 · Parallel discovery", "3 · Synthesis"], text: "Twelve specialists work in parallel. The Builder checks every output, blocks unsupported claims and flags disagreements." },
  { who: "You", title: "Review and approve", phases: ["4 · Live preview", "5 · Approval", "6 · Apply"], text: "Preview the page, then approve, edit or reject each change. Only approved changes create a new version." },
  { who: "Builder", title: "Quality check", phases: ["7 · QA", "8 · Changelog"], text: "Facts, claims, brand, links and layout are re-checked. Critical issues block approval; every change is logged." },
  { who: "You + AI", title: "Iterate", phases: ["9 · Next round"], text: "Ask for changes in plain words. Only the affected agents rerun, building on the approved version." },
];

export default async function Overview() {
  await ensureExamples();
  const campaigns = await listCampaigns();
  const names = new Set(campaigns.filter((c) => c.origin === "example").map((c) => c.brief.name));
  const missingExamples = EXAMPLES.filter((e) => !names.has(e.brief.name)).length;
  const heroImg = SAMPLE_BRIEF.images[0];

  return (
    <div>
      <section className="relative overflow-hidden border-b border-line">
        <div className="mx-auto grid max-w-[88rem] gap-10 px-4 py-14 md:grid-cols-12 md:px-8 md:py-20">
          <div className="md:col-span-6 md:pt-6">
            <p className="eyebrow mb-5 text-taupe">AI luxury marketing studio · prototype</p>
            <h1 className="font-display text-[2.75rem] leading-[1.05] text-ink md:text-[4rem]">From property brief to a reviewed, brand-true campaign.</h1>
            <p className="mt-6 max-w-lg text-[0.975rem] leading-relaxed text-charcoal">
              Twelve specialist agents research, write, art-direct and check a listing campaign. A central Builder validates their work, surfaces disagreements and protects the facts. Nothing reaches the live page until a person approves it.
            </p>
            <div className="mt-9 flex flex-wrap items-start gap-3">
              <ButtonLink href="/campaigns/new" size="lg">Start a new brief</ButtonLink>
              <ButtonLink href="#campaigns" variant="secondary" size="lg">Explore the examples</ButtonLink>
            </div>
            <p className="mt-4 text-xs text-stone">Paste a listing in Spanish or English and the form fills itself.</p>
          </div>
          <div className="relative md:col-span-6">
            <SafeImage src={heroImg.url} alt={heroImg.caption} caption={heroImg.caption} eager sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] w-full rounded-[2px] md:aspect-[5/4]" />
            <div className="absolute -bottom-5 left-5 right-5 border border-line bg-paper px-5 py-4 shadow-[0_18px_40px_-24px_rgba(26,25,23,0.45)] md:left-auto md:w-80">
              <p className="eyebrow text-taupe">Example · Builder synthesis</p>
              <p className="mt-1.5 text-sm leading-snug text-charcoal">Two agents disagree on the hero headline. Recommendation: the editorial option; the keyword phrase moves to the meta title. Awaiting your decision.</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-h" className="border-b border-line bg-paper/60">
        <div className="mx-auto max-w-[88rem] px-4 py-14 md:px-8">
          <p className="eyebrow text-taupe">How it works</p>
          <h2 id="how-h" className="font-display mt-1 text-3xl text-ink md:text-4xl">Five steps, one person in control</h2>
          <ol className="relative mt-10 grid gap-8 lg:grid-cols-5 lg:gap-6">
            <span aria-hidden className="absolute bottom-2 left-[0.9rem] top-2 w-px bg-line-strong lg:left-0 lg:right-0 lg:top-[0.9rem] lg:bottom-auto lg:h-px lg:w-auto" />
            {TIMELINE.map((s, i) => (
              <li key={s.title} className="relative grid grid-cols-[1.8rem_1fr] gap-4 lg:block">
                <span className={`relative z-10 flex size-[1.8rem] items-center justify-center rounded-full border text-xs font-medium ${s.who === "You" ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper text-umber"}`}>{i + 1}</span>
                <div className="lg:mt-5 lg:pr-4">
                  <p className="eyebrow text-stone">{s.who}</p>
                  <h3 className="font-display mt-1 text-2xl leading-tight text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal">{s.text}</p>
                  <p className="mt-3 flex flex-wrap gap-1">{s.phases.map((p) => <Badge key={p}>{p}</Badge>)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-xs text-stone">Filled steps are yours; outlined steps are done by the agents and the Builder.</p>
        </div>
      </section>

      <section id="campaigns" aria-labelledby="campaigns-h" className="mx-auto max-w-[88rem] scroll-mt-20 px-4 py-14 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="campaigns-h" className="font-display text-3xl text-ink">Campaigns</h2>
            <p className="mt-1 text-sm text-stone">Examples are fictional and preloaded: agents have already run. Four have the Builder’s recommendations pre-applied (labelled as seeded, not human decisions); Casa Tezontle is waiting for your review.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RestoreExamplesButton missing={missingExamples} />
            <ButtonLink href="/campaigns/new" variant="secondary" size="sm">New campaign</ButtonLink>
          </div>
        </div>
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns" action={<div className="flex flex-wrap justify-center gap-2"><RestoreExamplesButton missing={missingExamples} /><QuickStart variant="secondary" label="Run a sample campaign" /></div>}>
            You deleted every campaign. Restore the examples or start a new brief.
          </EmptyState>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((c) => {
              const s = stageOf(c);
              const pending = c.proposals.filter((p) => p.status === "pending").length;
              const crit = criticalOpen(c);
              const content = currentContent(c);
              const hero = c.brief.images.find((i) => i.id === content.landing.heroImageId) ?? c.brief.images[0];
              return (
                <li key={c.id} className="group flex flex-col overflow-hidden rounded-[4px] border border-line bg-paper">
                  <Link href={`/campaigns/${c.id}`} className="relative block overflow-hidden" tabIndex={-1} aria-hidden>
                    <SafeImage src={hero?.url} alt="" caption={hero?.caption} sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" className="aspect-[16/10] w-full transition-transform duration-700 group-hover:scale-[1.02]" />
                    {c.origin === "example" && <span className="eyebrow absolute left-3 top-3 bg-paper/90 px-2 py-1 text-[0.6rem] text-umber">Example</span>}
                  </Link>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="eyebrow text-taupe">{c.brief.neighborhood} · {c.brief.city}</p>
                    <Link href={`/campaigns/${c.id}`} className="font-display mt-1 text-2xl text-ink hover:underline">{c.brief.name}</Link>
                    <p className="mt-0.5 text-sm text-stone">{formatPrice(c.brief.price.amount, c.brief.price.currency)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-stone">
                      <Badge tone={STAGE_TONE[s]}>{STAGE_LABEL[s]}</Badge>
                      <span>v{c.currentVersion}</span>
                      <span aria-hidden>·</span>
                      <span>{pending ? `${pending} to review` : "nothing to review"}</span>
                      {crit > 0 && <><span aria-hidden>·</span><span className="text-bad">{crit} critical</span></>}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                      <ButtonLink href={`/campaigns/${c.id}/${pending ? "review" : "studio"}`} size="sm">{pending ? "Review" : "Open"}</ButtonLink>
                      <a href={`/p/${c.id}`} target="_blank" rel="noreferrer" className="px-2 text-xs underline underline-offset-2">Live page ↗</a>
                      <span className="ml-auto"><DeleteCampaignButton id={c.id} name={c.brief.name} /></span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
