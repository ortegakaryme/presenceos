import { restore, WorkflowError } from "@/lib/server/campaigns";
import { handle, jsonBody, type IdParams } from "@/lib/server/http";

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async () => {
    const body = await jsonBody(req);
    const v = Number(body.version);
    if (!Number.isInteger(v)) throw new WorkflowError("version must be an integer.");
    return restore(id, v);
  });
}
