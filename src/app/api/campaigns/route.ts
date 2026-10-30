import { after } from "next/server";
import { createCampaign, ensureExamples, listCampaigns } from "@/lib/server/campaigns";
import { handle, handleMutation, runsInRequest } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return handle(async () => {
    await ensureExamples();
    return (await listCampaigns()).map((c) => ({ id: c.id, name: c.brief.name, origin: c.origin ?? "user", updatedAt: c.updatedAt }));
  });
}

export async function POST(req: Request) {
  return handleMutation(req, async (body) => {
    const { campaign, run } = await createCampaign(body.brief, { injectFailure: body.injectFailure === true });
    if (run) {
      if (runsInRequest()) await run.completion;
      else after(run.completion);
    }
    return { id: campaign.id, runId: run?.runId };
  }, 201);
}
