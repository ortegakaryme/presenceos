import { redirect } from "next/navigation";

export default async function CampaignIndex({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/campaigns/${(await params).id}/agents`);
}
