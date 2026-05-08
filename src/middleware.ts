import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  decodeSessionCookie,
  getSafeRedirectPath,
} from "@/lib/session-cookie";

const PROTECTED_PREFIXES = ["/dashboard", "/projects"];

const PROTECTED_API_PREFIXES = [
  "/api/create-project",
  "/api/export",
  "/api/ai",
  "/api/history",
  "/api/billing",
  "/api/email",
  "/api/tts",
];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionCookie ? decodeSessionCookie(sessionCookie) : null;

  if (session && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && pathname === "/login") {
    const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  const isProtectedPage = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isProtectedApi = PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    if (isProtectedApi) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Please log in." },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon\\.ico|api/auth|about|pricing|blog).*)",
  ],
};
