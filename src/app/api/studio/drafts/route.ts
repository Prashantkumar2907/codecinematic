import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDraft, draftFilePath, listDrafts } from "@/lib/state";
import fs from "node:fs/promises";

export async function GET() {
  return NextResponse.json({ drafts: await listDrafts() });
}

const deleteSchema = z.object({
  action: z.literal("delete"),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

export async function POST(req: Request) {
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "expected {action:'delete', slug}" }, { status: 400 });
  }
  try {
    await fs.access(draftFilePath(parsed.data.slug, "script.json"));
  } catch {
    return NextResponse.json({ error: `draft ${parsed.data.slug} not found` }, { status: 404 });
  }
  await deleteDraft(parsed.data.slug);
  return NextResponse.json({ ok: true });
}
