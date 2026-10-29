import { notFound } from "next/navigation";
import { findCampaign } from "@/lib/server/campaigns";
import { CampaignProvider } from "@/lib/client/CampaignContext";
import { CampaignHeader } from "@/components/CampaignHeader";

export const dynamic = "force-dynamic";

export default async function CampaignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await findCampaign(id);
  if (!campaign) notFound();
  return (
    <CampaignProvider initial={campaign}>
      <CampaignHeader />
      <div className="mx-auto max-w-[88rem] px-4 py-8 md:px-8">{children}</div>
    </CampaignProvider>
  );
}
