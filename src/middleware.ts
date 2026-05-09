import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  decodeSessionCookie,
  getSafeRedirectPath,
} from "@/lib/session-cookie";
import { isRoutableProjectId } from "@/lib/project-ids";

const PROTECTED_PREFIXES = ["/dashboard", "/projects"];

const PROTECTED_API_PREFIXES = [
  "/api/create-project",
  "/api/export",
  "/api/projects",
  "/api/ai",
  "/api/history",
  "/api/email",
  "/api/tts",
];

const PROTECTED_API_PATHS = ["/api/billing/checkout"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionCookie ? await decodeSessionCookie(sessionCookie) : null;

  if (session && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && pathname === "/login") {
    const nextPath = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  const isProtectedPage = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isProtectedApi =
    PROTECTED_API_PATHS.includes(pathname) ||
    PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (pathname.startsWith("/projects/")) {
    const projectId = pathname.split("/")[2] ?? "";
    if (!isRoutableProjectId(projectId)) {
      return new NextResponse("Project not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  }

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    if (isProtectedApi) {
      return NextResponse.json(
        { ok: false, error: { code: "unauthorized", message: "Unauthorized. Please log in." } },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // API routes and server components are the authoritative session validators.
  // Middleware only handles missing-cookie redirects so Edge/runtime env drift
  // cannot lock valid production users out before Node handlers can verify.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon\\.ico|api/auth|about|pricing|blog).*)",
  ],
};
