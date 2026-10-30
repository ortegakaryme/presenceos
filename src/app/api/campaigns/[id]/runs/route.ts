import { after } from "next/server";
import { startRun } from "@/lib/server/campaigns";
import { handleMutation, runsInRequest, type IdParams } from "@/lib/server/http";

// Agents keep running after the response; on serverless hosts `after` keeps the function alive.
// Without shared storage the run finishes inside the request so its result can be returned.
export const maxDuration = 300;

export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handleMutation(req, async (body) => {
    const { runId, iteration, completion } = await startRun(id, {
      feedback: typeof body.feedback === "string" ? body.feedback : undefined,
      injectFailure: body.injectFailure === true,
      delayMs: runsInRequest() ? 150 : undefined,
    });
    if (runsInRequest()) await completion;
    else after(completion);
    return { runId, iteration };
  }, 202);
}
