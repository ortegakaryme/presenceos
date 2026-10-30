import { NextResponse } from "next/server";
import { WorkflowError, BriefValidationError, withBrowserState } from "./campaigns";
import { storageMode } from "./store";

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

/**
 * For mutations: reads the JSON body once, applies browser-held state when the deployment has no
 * shared storage, and returns `{ ...result, __state }` so the browser can save what changed.
 */
export async function handleMutation<T extends object | void>(req: Request, fn: (body: Record<string, unknown>) => Promise<T>, status = 200): Promise<NextResponse> {
  return handle(async () => {
    const body = req.headers.get("content-length") === "0" ? {} : await jsonBody(req).catch(() => ({}) as Record<string, unknown>);
    const { result, state } = await withBrowserState(body.__state, () => fn(body));
    return state ? { ...(result ?? {}), __state: state } : (result ?? { ok: true });
  }, status);
}

/** True when agent runs must finish inside the request (no shared store to continue in). */
export function runsInRequest(): boolean {
  return storageMode() === "browser";
}
