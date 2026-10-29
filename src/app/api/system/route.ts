import { NextResponse } from "next/server";
import { resolveMode } from "@/lib/agents/llm";

export const dynamic = "force-dynamic";

/** Reports the execution mode. Never returns key material. */
export async function GET() {
  const { mode, model, reason } = resolveMode();
  return NextResponse.json({ mode, model: mode === "model" ? model : null, reason });
}
