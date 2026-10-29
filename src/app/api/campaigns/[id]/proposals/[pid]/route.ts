import { decideProposal, WorkflowError } from "@/lib/server/campaigns";
import { handle, jsonBody } from "@/lib/server/http";
import type { FieldValue } from "@/lib/domain/schemas";

const ACTIONS = ["approve", "reject", "reset", "edit"] as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  return handle(async () => {
    const body = await jsonBody(req);
    const action = ACTIONS.find((a) => a === body.action);
    if (!action) throw new WorkflowError(`action must be one of ${ACTIONS.join(", ")}`);
    return decideProposal(id, pid, { action, editedValue: body.editedValue as FieldValue | undefined, note: typeof body.note === "string" ? body.note : undefined });
  });
}
