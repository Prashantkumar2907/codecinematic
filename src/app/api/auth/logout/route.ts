import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));

  // Clear the app session cookie
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });

  // Also sign out from Supabase if configured
  if (hasSupabaseEnv()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore — cookie is already cleared
    }
  }

  return response;
}
