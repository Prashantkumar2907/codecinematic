import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteNewsDraft, listNewsDrafts, readNewsInfo } from "@/lib/news";

export async function GET() {
  try {
    return NextResponse.json({ drafts: await listNewsDrafts() });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 500 });
  }
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
  if (!(await readNewsInfo(parsed.data.slug))) {
    return NextResponse.json({ error: `news draft ${parsed.data.slug} not found` }, { status: 404 });
  }
  await deleteNewsDraft(parsed.data.slug);
  return NextResponse.json({ ok: true });
}
