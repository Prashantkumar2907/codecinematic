import { NextResponse } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");

  if (!provider || (provider !== "google" && provider !== "github")) {
    return NextResponse.redirect(new URL("/login?error=provider", request.url));
  }

  if (!hasSupabaseEnv()) {
    return NextResponse.redirect(new URL("/login?error=configure-supabase", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    }
  });

  return NextResponse.redirect(data.url);
}
