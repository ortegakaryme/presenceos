import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findCampaign } from "@/lib/server/campaigns";
import { storageMode } from "@/lib/server/store";
import { currentContent } from "@/lib/builder/apply";
import { publicView } from "@/lib/builder/view";
import { PublicProperty } from "@/components/property/PublicProperty";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; v?: string; embed?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await findCampaign(decodeURIComponent((await params).id));
  if (!c) return { title: "Property" };
  const content = currentContent(c);
  return { title: { absolute: content.seo.metaTitle || c.brief.name }, description: content.seo.metaDescription || undefined, robots: { index: false } };
}

export default async function PublicPropertyPage({ params, searchParams }: Props) {
  const id = decodeURIComponent((await params).id);
  const sp = await searchParams;
  const mode = storageMode();
  const c = await findCampaign(id);
  const r = c ? publicView(c, sp.view, sp.v) : null;
  if (!r && mode === "server") notFound();
  return <PublicProperty id={id} view={sp.view} v={sp.v} embed={sp.embed === "1"} mode={mode} initial={r && c ? { brief: c.brief, ...r } : null} />;
}
