import { NextResponse } from "next/server";
import { geminiQuotaSnapshot } from "@/lib/gemini";
import { readHistory, readSubjects } from "@/lib/state";

export async function GET() {
  const [subjects, history, quota] = await Promise.all([readSubjects(), readHistory(), geminiQuotaSnapshot()]);
  return NextResponse.json({ subjects, history: history.slice(-40).reverse(), quota });
}
