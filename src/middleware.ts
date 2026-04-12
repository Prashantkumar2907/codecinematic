import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Protected paths — any request matching these prefixes requires authentication.
 * Public paths (login, marketing pages, API auth routes) are excluded.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/projects"];

/** API routes that must not redirect (return JSON 401 instead). */
const PROTECTED_API_PREFIXES = ["/api/export", "/api/ai", "/api/history", "/api/billing", "/api/email", "/api/tts"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read session cookie early so it's available for all checks
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;

  // Redirect logged-in users from home page to dashboard
  if (pathname === "/" && sessionCookie) {
    try {
      const decoded = JSON.parse(
        Buffer.from(sessionCookie, "base64url").toString("utf8")
      ) as { email?: string };
      if (decoded.email) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      // invalid cookie — fall through
    }
  }

  // Check if route is protected
  const isProtectedPage = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isProtectedApi = PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    if (isProtectedApi) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }
    // Redirect to login, preserving the intended destination
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Validate the session cookie is parseable (basic sanity check)
  try {
    const decoded = JSON.parse(
      Buffer.from(sessionCookie, "base64url").toString("utf8")
    ) as { email?: string; plan?: string };

    if (!decoded.email) throw new Error("invalid session");
  } catch {
    // Corrupt session — clear and redirect
    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico
     * - Public marketing pages (/, /about, etc.)
     * - Auth routes (/login, /api/auth/*)
     */
    "/",
    "/((?!_next/static|_next/image|favicon\\.ico|api/auth|login|about|pricing|blog).*)",
  ],
};
