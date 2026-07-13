import { NextResponse } from "next/server";
import { geminiQuotaSnapshot } from "@/lib/gemini";
import { readHistory, readSubjects } from "@/lib/state";
import { teachingChannelMap } from "@/lib/news";

export async function GET() {
  const [subjects, history, quota, uploadChannels] = await Promise.all([
    readSubjects(),
    readHistory(),
    geminiQuotaSnapshot(),
    teachingChannelMap().catch(() => ({})),
  ]);
  return NextResponse.json({ subjects, history: history.slice(-40).reverse(), quota, uploadChannels });
}
