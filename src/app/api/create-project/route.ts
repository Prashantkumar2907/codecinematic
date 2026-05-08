import { randomUUID } from "crypto";

import { z } from "zod";

import { apiError, apiSuccess, readJsonBody } from "@/lib/api-response";
import { getSession } from "@/lib/auth";
import { validateCodePayload } from "@/lib/quotas/limits";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

const projectSchema = z.object({
  title: z.string().trim().min(2).max(120),
  language: z.string().trim().min(1).max(40),
  aspectRatioMode: z.enum(["9:16", "16:9", "both"]),
  contentRaw: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const parsed = projectSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return apiError("invalid_payload", "Invalid payload", 400, parsed.error.flatten());
  }

  const validation = validateCodePayload(session.plan, parsed.data.contentRaw);
  if (!validation.ok) {
    return apiError("quota_exceeded", "Code exceeds current plan line limits.", 400, {
      lineCount: validation.lineCount,
      longestLine: validation.longestLine,
      limits: validation.limits,
    });
  }

  const context = await getSupabaseUserContext();
  if (context) {
    const { data, error } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.user.id,
        title: parsed.data.title,
        slug: slugify(parsed.data.title),
        primary_language: parsed.data.language,
        content_raw: parsed.data.contentRaw,
        content_structured: {
          source: "code_studio",
          createdVia: "api/create-project",
        },
        aspect_ratio_mode: parsed.data.aspectRatioMode,
        max_line_count_applied: validation.limits.maxCodeLines,
        max_line_length_applied: validation.limits.maxLineLength,
        total_line_count: validation.lineCount,
        longest_line_length: validation.longestLine,
        last_opened_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return apiError("upstream_error", "Could not create project.", 502);
    }

    return apiSuccess({
      projectId: data.id,
      mode: "supabase",
      message: "Project created.",
    });
  }

  return apiSuccess({
    projectId: randomUUID(),
    mode: "demo",
    message: "Project payload validated for current plan.",
  });
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "untitled-project";
}
