import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { dataDir, uploadsEnabled } from "@/lib/server/store";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 8 * 1024 * 1024;

export async function POST(req: Request) {
  if (!uploadsEnabled()) return NextResponse.json({ error: "Photo uploads are disabled on this hosted demo (no persistent disk). Paste an https image URL instead." }, { status: 501 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 415 });
  if (file.size > MAX) return NextResponse.json({ error: "Images must be 8 MB or smaller." }, { status: 413 });
  const name = `${randomBytes(8).toString("hex")}.${ext}`;
  const dir = path.join(dataDir(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/api/uploads/${name}` }, { status: 201 });
}
