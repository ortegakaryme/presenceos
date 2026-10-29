import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/server/store";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(name)) return new Response("Not found", { status: 404 });
  const file = path.join(dataDir(), "uploads", name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": MIME[name.split(".")[1]], "Cache-Control": "public, max-age=31536000, immutable" } });
}
