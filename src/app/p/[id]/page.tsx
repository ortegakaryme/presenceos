import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { findCampaign } from "@/lib/server/campaigns";
import { currentContent } from "@/lib/builder/apply";
import { draftContent } from "@/lib/builder/draft";
import { PropertyPage } from "@/components/property/PropertyPage";
import { PreviewTracker } from "@/components/PreviewTracker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; v?: string; embed?: string }> };

const load = (id: string) => findCampaign(id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load((await params).id);
  if (!c) return { title: "Not found" };
  const content = currentContent(c);
  return { title: { absolute: content.seo.metaTitle || c.brief.name }, description: content.seo.metaDescription || undefined, robots: { index: false } };
}

export default async function PublicPropertyPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await load(id);
  if (!c) notFound();

  let content = currentContent(c);
  let label = `Live page · v${c.currentVersion}${c.approval?.version === c.currentVersion ? " · approved" : " · not yet approved"}`;
  if (sp.view === "draft") {
    const d = draftContent(c);
    content = d.content;
    label = `Draft preview · v${c.currentVersion} + ${d.overlaid} unapplied proposals — not published`;
  } else if (sp.v) {
    const v = c.versions.find((x) => x.number === Number(sp.v));
    if (!v) notFound();
    content = v.content;
    label = `Historical version v${v.number}`;
  }

  return (
    <>
      <PreviewTracker campaignId={c.id} view={sp.view === "draft" ? "draft" : sp.v ? "version" : "live"} />
      <PropertyPage
        brief={c.brief}
        content={content}
        banner={
          // The status pill is for authors: shown on drafts and historical versions, not the live page.
          (sp.view === "draft" || sp.v) && <div className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-[3px] bg-ink/90 px-3 py-2 text-[0.7rem] tracking-wide text-paper/85 shadow-lg backdrop-blur">
            <span className={sp.view === "draft" ? "text-warn-soft" : ""}>{label}</span>
            {sp.embed !== "1" && (
              <Link href={`/campaigns/${c.id}/studio`} className="whitespace-nowrap underline underline-offset-2 hover:text-paper">
                Open studio
              </Link>
            )}
          </div>
        }
      />
    </>
  );
}
