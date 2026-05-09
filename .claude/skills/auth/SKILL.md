---
name: auth
description: Load when editing CodeCinematic login, signed session cookies, Supabase OAuth, redirects, middleware, protected pages, or auth-sensitive APIs.
---

# Auth

## When to use this skill
Use this for `src/lib/auth.ts`, `src/lib/session-cookie.ts`, `src/middleware.ts`, `src/app/(auth)`, and `src/app/api/auth`.

## Quick reference
- Session cookie: `codecinematic_session`
- Session implementation: `src/lib/session-cookie.ts`
- Session reader: `getSession()` in `src/lib/auth.ts`
- Demo credentials source: `src/lib/demo-account.ts`
- Login UI: `src/app/(auth)/login/page.tsx`
- Demo login route: `src/app/api/auth/demo-login/route.ts`
- Social login routes: `src/app/api/auth/social/route.ts`, `src/app/api/auth/callback/route.ts`
- Middleware: `src/middleware.ts`

## Auth flow
1. Login form posts email/password to `/api/auth/demo-login`.
2. The route validates form data with Zod.
3. Demo admin credentials mint a signed app session with plan `high`.
4. Non-demo credentials use Supabase password auth only when Supabase env is configured.
5. Social auth starts at `/api/auth/social`, redirects through Supabase, then `/api/auth/callback` exchanges the code and mints the app session.
6. Protected server components and route handlers call `await getSession()`.

## Session rules
- Use `encodeSession()` and `decodeSessionCookie()`; never hand-parse or hand-write `codecinematic_session`.
- Cookie options should remain `httpOnly`, `sameSite: "lax"`, `path: "/"`, seven-day `maxAge`, and `secure` in production.
- Production requires a 32+ character `SESSION_SECRET`; dev falls back to a local-only secret.
- Use `getSafeRedirectPath()` for every `next` value or auth redirect target.

## Middleware role
- Middleware redirects logged-in users from `/` to `/dashboard` and from `/login` to the safe `next` path.
- Middleware blocks missing-cookie requests to `/dashboard`, `/projects`, and protected APIs.
- Middleware does not fully validate signed sessions for protected pages; server components and API routes remain authoritative.
- `/api/billing/webhook` must stay outside app-session auth and verify Stripe signatures.

## Do not
- Do not duplicate demo credentials outside `src/lib/demo-account.ts`.
- Do not expose Supabase auth errors or user enumeration details to the login UI.
- Do not redirect to raw user input or external origins.
- Do not protect Stripe webhooks with app sessions.
