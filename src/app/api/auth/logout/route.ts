import { NextResponse } from "next/server";

import { DEMO_SESSION_COOKIE } from "@/lib/demo-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(DEMO_SESSION_COOKIE, "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/"
  });
  return response;
}
