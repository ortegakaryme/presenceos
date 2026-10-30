import { submitHumanEdit, WorkflowError } from "@/lib/server/campaigns";
import { handleMutation, type IdParams } from "@/lib/server/http";
import type { FieldValue } from "@/lib/domain/schemas";

/** Human edit from the Creative Studio → human-authored proposal. */
export async function POST(req: Request, { params }: IdParams) {
  const { id } = await params;
  return handleMutation(req, async (body) => {
    if (typeof body.field !== "string" || body.value === undefined) throw new WorkflowError("field and value are required.");
    return submitHumanEdit(id, { field: body.field, value: body.value as FieldValue, note: typeof body.note === "string" ? body.note : undefined });
  }, 201);
}
