import { NextResponse } from "next/server";

import { SESSION_COOKIE, encodeSession } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getSafeRedirectPath } from "@/lib/session-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

function loginRedirect(request: Request, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = getSafeRedirectPath(url.searchParams.get("next"));

  if (!code) {
    return loginRedirect(request, "oauth-missing-code");
  }

  if (!hasSupabaseEnv()) {
    return loginRedirect(request, "supabase-not-configured");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const user = data.user;

    if (error || !user?.email) {
      return loginRedirect(request, "oauth-failed");
    }

    const response = NextResponse.redirect(new URL(nextPath, request.url));
    response.cookies.set(
      SESSION_COOKIE,
      await encodeSession({
        email: user.email,
        plan: "free",
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email.split("@")[0],
        isAdmin: false,
      }),
      SESSION_COOKIE_OPTIONS,
    );

    return response;
  } catch {
    return loginRedirect(request, "oauth-failed");
  }
}
