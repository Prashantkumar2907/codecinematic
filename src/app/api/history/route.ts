import { apiError, apiSuccess } from "@/lib/api-response";
import { getSession } from "@/lib/auth";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const context = await getSupabaseUserContext();
  if (context) {
    const { data, error } = await context.supabase
      .from("exports")
      .select("id, aspect_ratio, status, render_mode, created_at, projects(title)")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return apiError("upstream_error", "Could not load export history.", 502);
    }

    return apiSuccess({
      items: (data ?? []).map((item) => ({
        id: item.id,
        title: getProjectTitle(item.projects),
        aspectRatio: item.aspect_ratio,
        status: item.status,
        mode: item.render_mode,
      })),
    });
  }

  return apiSuccess({
    items: [
      {
        id: "demo-export-vertical",
        title: "API Gateway explainer",
        aspectRatio: "9:16",
        status: "completed",
        mode: "browser",
      },
      {
        id: "demo-export-landscape",
        title: "API Gateway explainer",
        aspectRatio: "16:9",
        status: "completed",
        mode: "browser",
      },
    ],
  });
}

function getProjectTitle(project: unknown): string {
  if (Array.isArray(project)) {
    const first = project[0] as { title?: unknown } | undefined;
    return typeof first?.title === "string" ? first.title : "Untitled project";
  }

  if (project && typeof project === "object" && "title" in project) {
    const title = (project as { title?: unknown }).title;
    return typeof title === "string" ? title : "Untitled project";
  }

  return "Untitled project";
}
