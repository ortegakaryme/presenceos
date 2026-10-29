import { seedExamples } from "@/lib/server/campaigns";
import { handle } from "@/lib/server/http";

export const maxDuration = 60;

/** Re-adds any preloaded example campaigns that were deleted. */
export async function POST() {
  return handle(async () => ({ added: await seedExamples() }));
}
