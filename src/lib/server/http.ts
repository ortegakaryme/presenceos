import { NextResponse } from "next/server";
import { WorkflowError, BriefValidationError } from "./campaigns";

/** Uniform JSON responses and error mapping for route handlers. */
export async function handle<T>(fn: () => Promise<T> | T, status = 200): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { status });
  } catch (e) {
    if (e instanceof BriefValidationError) return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.status });
    if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    throw new WorkflowError("Request body must be JSON.");
  }
}

export type IdParams = { params: Promise<{ id: string }> };
