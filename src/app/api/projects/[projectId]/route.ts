import { z } from "zod";

import { apiError, apiSuccess, readJsonBody } from "@/lib/api-response";
import { getSession } from "@/lib/auth";
import { deleteDemoProject, getDemoProject, saveDemoProject } from "@/lib/demo-project-store";
import { isRoutableProjectId, isUuid } from "@/lib/project-ids";
import { validateCodePayload } from "@/lib/quotas/limits";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

const projectUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  language: z.string().trim().min(1).max(40),
  aspectRatioMode: z.enum(["9:16", "16:9", "both"]),
  contentRaw: z.string().min(1),
});

type Params = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const { projectId } = await params;
  if (!isRoutableProjectId(projectId)) {
    return apiError("not_found", "Project not found.", 404);
  }

  const context = await getSupabaseUserContext();
  if (context && isUuid(projectId)) {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, title, primary_language, content_raw, aspect_ratio_mode, updated_at")
      .eq("id", projectId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (error) {
      return apiError("upstream_error", "Could not load project.", 502);
    }

    if (!data) {
      return apiError("not_found", "Project not found.", 404);
    }

    return apiSuccess({
      project: {
        id: data.id,
        title: data.title,
        language: data.primary_language,
        contentRaw: data.content_raw,
        aspectRatioMode: data.aspect_ratio_mode,
        updatedAt: data.updated_at,
      },
    });
  }

  const demoProject = getDemoProject(session.email, projectId);
  if (!demoProject) {
    return apiError(
      "not_found",
      "Project is only available in local browser storage until it is saved from the editor.",
      404,
    );
  }

  return apiSuccess({
    project: {
      id: demoProject.id,
      title: demoProject.title,
      language: demoProject.language,
      contentRaw: demoProject.contentRaw,
      aspectRatioMode: demoProject.aspectRatioMode,
      updatedAt: demoProject.updatedAt,
    },
  });
}

export async function PUT(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const { projectId } = await params;
  if (!isRoutableProjectId(projectId)) {
    return apiError("not_found", "Project not found.", 404);
  }

  const parsed = projectUpdateSchema.safeParse(await readJsonBody(request));
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
  if (context && isUuid(projectId)) {
    const { data, error } = await context.supabase
      .from("projects")
      .update({
        title: parsed.data.title,
        primary_language: parsed.data.language,
        content_raw: parsed.data.contentRaw,
        aspect_ratio_mode: parsed.data.aspectRatioMode,
        max_line_count_applied: validation.limits.maxCodeLines,
        max_line_length_applied: validation.limits.maxLineLength,
        total_line_count: validation.lineCount,
        longest_line_length: validation.longestLine,
        last_opened_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", context.user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return apiError("upstream_error", "Could not update project.", 502);
    }

    if (!data) {
      return apiError("not_found", "Project not found.", 404);
    }
  } else {
    saveDemoProject(session.email, {
      id: projectId,
      title: parsed.data.title,
      language: parsed.data.language,
      aspectRatioMode: parsed.data.aspectRatioMode,
      contentRaw: parsed.data.contentRaw,
    });
  }

  return apiSuccess({
    projectId,
    mode: context && isUuid(projectId) ? "supabase" : "demo",
    message: "Project updated.",
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const { projectId } = await params;
  if (!isRoutableProjectId(projectId)) {
    return apiError("not_found", "Project not found.", 404);
  }

  const context = await getSupabaseUserContext();
  if (context && isUuid(projectId)) {
    const { error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", context.user.id);

    if (error) {
      return apiError("upstream_error", "Could not delete project.", 502);
    }
  } else {
    deleteDemoProject(session.email, projectId);
  }

  return apiSuccess({
    projectId,
    mode: context && isUuid(projectId) ? "supabase" : "demo",
    message: "Project deleted.",
  });
}
