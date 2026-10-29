import { after } from "next/server";
import { startRun } from "@/lib/server/campaigns";
import { handle, jsonBody, type IdParams } from "@/lib/server/http";

// Agents keep running after the response; on serverless hosts `after` keeps the function alive.
export const maxDuration = 300;

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handle(async () => {
    const body = await jsonBody(req);
    const { runId, iteration, completion } = await startRun(id, { feedback: typeof body.feedback === "string" ? body.feedback : undefined, injectFailure: body.injectFailure === true });
    after(completion);
    return { runId, iteration };
  }, 202);
}
