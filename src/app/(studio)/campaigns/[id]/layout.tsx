import { notFound } from "next/navigation";
import { findCampaign } from "@/lib/server/campaigns";
import { storageMode } from "@/lib/server/store";
import { CampaignGate } from "@/components/CampaignGate";

export const dynamic = "force-dynamic";

export default async function CampaignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await findCampaign(decodeURIComponent(id));
  const mode = storageMode();
  // In browser mode a campaign the server doesn't know may still live in this visitor's browser.
  if (!campaign && mode === "server") notFound();
  return (
    <CampaignGate id={decodeURIComponent(id)} initial={campaign} mode={mode}>
      {children}
    </CampaignGate>
  );
}
