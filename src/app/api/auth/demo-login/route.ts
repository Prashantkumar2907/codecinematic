import { NextResponse } from "next/server";

import { SESSION_COOKIE, isAdminLogin, buildAdminSession, encodeSession } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Admin bypass — no database needed
  if (isAdminLogin(email, password)) {
    const session = buildAdminSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, encodeSession(session), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return response;
  }

  // Regular Supabase email/password login
  if (!hasSupabaseEnv()) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 401 }
      );
    }

    // Build a session from Supabase user
    const session = {
      email: data.user.email ?? email,
      plan: "free" as const,
      name: data.user.user_metadata?.full_name ?? email.split("@")[0],
      isAdmin: false,
    };

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, encodeSession(session), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}
