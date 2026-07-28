import { NextResponse } from "next/server";
import { probeKeyModels } from "@/lib/gemini";

/** Per-key × per-model availability for the model/key picker. `?force=1` bypasses
 *  the 5-minute probe cache. Never returns raw keys — only masked ids/labels. */
export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const keys = await probeKeyModels(force);
    return NextResponse.json({ keys });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "probe failed" }, { status: 500 });
  }
}
