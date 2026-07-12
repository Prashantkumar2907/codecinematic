import { NextResponse } from "next/server";
import { listNewsDrafts } from "@/lib/news";

export async function GET() {
  try {
    return NextResponse.json({ drafts: await listNewsDrafts() });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 500 });
  }
}
