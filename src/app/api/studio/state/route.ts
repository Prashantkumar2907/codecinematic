import { NextResponse } from "next/server";
import { geminiQuotaSnapshot } from "@/lib/gemini";
import { readHistory, readSubjects } from "@/lib/state";
import { teachingChannelMap, teachingVoiceMap } from "@/lib/news";

export async function GET() {
  const [subjects, history, quota, uploadChannels, channelVoices] = await Promise.all([
    readSubjects(),
    readHistory(),
    geminiQuotaSnapshot(),
    teachingChannelMap().catch(() => ({})),
    teachingVoiceMap().catch(() => ({})),
  ]);
  return NextResponse.json({ subjects, history: history.slice(-40).reverse(), quota, uploadChannels, channelVoices });
}
