import { NextResponse } from "next/server";
import { listChannels, readCategories } from "@/lib/news";

export async function GET() {
  try {
    const [channels, categories] = await Promise.all([listChannels(), readCategories()]);
    return NextResponse.json({ channels, categories });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 500 });
  }
}
