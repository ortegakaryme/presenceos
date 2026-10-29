import { recordClientEvent, WorkflowError } from "@/lib/server/campaigns";
import { handle, jsonBody } from "@/lib/server/http";
import { CLIENT_EVENTS, type EventName } from "@/lib/analytics/events";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await jsonBody(req);
    const name = body.name as EventName;
    if (!CLIENT_EVENTS.includes(name)) throw new WorkflowError("Event not accepted from the client.");
    const props = body.props && typeof body.props === "object" ? (body.props as Record<string, unknown>) : {};
    await recordClientEvent(name, typeof body.campaignId === "string" ? body.campaignId : undefined, props);
    return { ok: true };
  }, 202);
}
