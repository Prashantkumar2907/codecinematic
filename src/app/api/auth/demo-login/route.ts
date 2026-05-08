import { apiError, apiSuccess } from "@/lib/api-response";
import { SESSION_COOKIE, buildAdminSession, encodeSession, isAdminLogin } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (isAdminLogin(email, password)) {
    try {
      const response = apiSuccess({});
      response.cookies.set(
        SESSION_COOKIE,
        await encodeSession(buildAdminSession()),
        SESSION_COOKIE_OPTIONS,
      );
      return response;
    } catch {
      return apiError("not_configured", "Session signing is not configured.", 500);
    }
  }

  if (!hasSupabaseEnv()) {
    return apiError("not_configured", "Supabase is not configured.", 400);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return apiError("unauthorized", error.message, 401);
    }

    const response = apiSuccess({});
    response.cookies.set(
      SESSION_COOKIE,
      await encodeSession({
        email: data.user.email ?? email,
        plan: "free",
        name: data.user.user_metadata?.full_name ?? email.split("@")[0],
        isAdmin: false,
      }),
      SESSION_COOKIE_OPTIONS,
    );
    return response;
  } catch {
    return apiError("upstream_error", "Unexpected error", 500);
  }
}
