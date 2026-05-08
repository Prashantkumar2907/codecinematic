import { randomUUID } from "crypto";

import { z } from "zod";

import { apiError, apiSuccess, readJsonBody } from "@/lib/api-response";
import { getSession } from "@/lib/auth";
import { PLAN_CONFIG } from "@/lib/plans";
import { getSupabaseUserContext, isUuid } from "@/lib/supabase/domain";

const exportSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => isUuid(value) || /^[a-zA-Z0-9_-]+$/.test(value), {
      message: "Project id must be a UUID or local project slug.",
    }),
  aspectRatios: z.array(z.enum(["9:16", "16:9"])).min(1).max(2),
  format: z.enum(["mp4", "webm"]).default("mp4"),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const parsed = exportSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return apiError("invalid_payload", "Invalid payload", 400, parsed.error.flatten());
  }

  const plan = PLAN_CONFIG[session.plan];
  const context = await getSupabaseUserContext();

  if (context && isUuid(parsed.data.projectId)) {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", parsed.data.projectId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (projectError) {
      return apiError("upstream_error", "Could not verify project ownership.", 502);
    }

    if (!project) {
      return apiError("forbidden", "Project not found for this user.", 403);
    }

    const rows = parsed.data.aspectRatios.map((aspectRatio) => ({
      project_id: parsed.data.projectId,
      user_id: context.user.id,
      aspect_ratio: aspectRatio,
      export_format: parsed.data.format,
      render_mode: "browser",
      status: "queued",
      watermarked: plan.watermark,
      metadata: {
        requestedBy: "api/export",
        storageAllowed: plan.maxStoredExports > 0,
      },
    }));

    const { data: exports, error: insertError } = await context.supabase
      .from("exports")
      .insert(rows)
      .select("id, aspect_ratio, export_format, watermarked");

    if (insertError || !exports) {
      return apiError("upstream_error", "Could not create export jobs.", 502);
    }

    return apiSuccess({
      jobs: exports.map((job) => ({
        exportId: job.id,
        aspectRatio: job.aspect_ratio,
        format: job.export_format,
        watermarked: job.watermarked,
        storageAllowed: plan.maxStoredExports > 0,
      })),
    });
  }

  return apiSuccess({
    jobs: parsed.data.aspectRatios.map((aspectRatio) => ({
      exportId: randomUUID(),
      aspectRatio,
      format: parsed.data.format,
      watermarked: plan.watermark,
      storageAllowed: plan.maxStoredExports > 0,
    })),
  });
}
