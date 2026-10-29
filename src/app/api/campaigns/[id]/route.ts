import { deleteCampaign, getCampaign } from "@/lib/server/campaigns";
import { handle, type IdParams } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(() => getCampaign(id));
}

export async function DELETE(_req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async () => {
    await deleteCampaign(id);
    return { ok: true };
  });
}
