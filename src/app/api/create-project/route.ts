import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getDemoSession } from "@/lib/demo-auth";
import { validateCodePayload } from "@/lib/quotas/limits";

const projectSchema = z.object({
  title: z.string().min(2).max(120),
  language: z.string().min(1).max(40),
  aspectRatioMode: z.enum(["9:16", "16:9", "both"]),
  contentRaw: z.string().min(1)
});

export async function POST(request: Request) {
  const session = await getDemoSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = projectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const validation = validateCodePayload(session.plan, parsed.data.contentRaw);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Code exceeds current plan line limits.",
        details: {
          lineCount: validation.lineCount,
          longestLine: validation.longestLine,
          limits: validation.limits
        }
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    projectId: randomUUID(),
    mode: "demo",
    message: "Project payload validated for current plan."
  });
}
