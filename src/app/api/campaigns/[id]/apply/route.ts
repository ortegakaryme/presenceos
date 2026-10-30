import { applyChanges } from "@/lib/server/campaigns";
import { handleMutation, type IdParams } from "@/lib/server/http";

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handleMutation(req, () => applyChanges(id));
}
