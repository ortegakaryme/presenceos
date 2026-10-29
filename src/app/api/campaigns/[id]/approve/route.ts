import { approveCampaign } from "@/lib/server/campaigns";
import { handle, type IdParams } from "@/lib/server/http";

export async function POST(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(() => approveCampaign(id));
}
