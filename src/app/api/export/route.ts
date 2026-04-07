import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getDemoSession } from "@/lib/demo-auth";
import { PLAN_CONFIG } from "@/lib/plans";

const exportSchema = z.object({
  projectId: z.string().min(1),
  aspectRatios: z.array(z.enum(["9:16", "16:9"])).min(1),
  format: z.enum(["mp4", "webm"]).default("mp4")
});

export async function POST(request: Request) {
  const session = await getDemoSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = exportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const plan = PLAN_CONFIG[session.plan];

  return NextResponse.json({
    jobs: parsed.data.aspectRatios.map((aspectRatio) => ({
      exportId: randomUUID(),
      aspectRatio,
      format: parsed.data.format,
      watermarked: plan.watermark,
      storageAllowed: plan.maxStoredExports > 0
    }))
  });
}
