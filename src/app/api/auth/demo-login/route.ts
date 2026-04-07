import { NextResponse } from "next/server";

import { DEMO_SESSION_COOKIE, encodeDemoSession, validateDemoLogin } from "@/lib/demo-auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const account = validateDemoLogin(email, password);

  if (!account) {
    return NextResponse.redirect(new URL("/login?error=invalid-demo", request.url));
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(DEMO_SESSION_COOKIE, encodeDemoSession(account), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return response;
}
