import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { getSafeRedirectPath } from "@/lib/session-cookie";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const nextPath = getSafeRedirectPath(url.searchParams.get("next"));

  if (!provider || (provider !== "google" && provider !== "github")) {
    return NextResponse.redirect(new URL("/login?error=invalid-provider", request.url));
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(
      new URL("/login?error=supabase-not-configured", request.url)
    );
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL("/login?error=oauth-failed", request.url)
    );
  }

  return NextResponse.redirect(data.url);
}
