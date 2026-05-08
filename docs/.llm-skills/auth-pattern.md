# Auth Pattern

## Critical Files

- `src/lib/session-cookie.ts`
- `src/lib/auth.ts`
- `src/middleware.ts`
- `src/app/api/auth/demo-login/route.ts`
- `src/app/api/auth/callback/route.ts`
- `src/app/api/auth/social/route.ts`
- `src/app/(auth)/login/page.tsx`
- `src/lib/demo-account.ts`

## Rules

- Server components and route handlers should call `await getSession()` from `src/lib/auth.ts`.
- Middleware decodes the same cookie through `decodeSessionCookie()` and protects `/dashboard`, `/projects`, and protected API prefixes.
- App sessions are HMAC-signed by `encodeSession()` and include an expiry. Do not manually parse or write `codecinematic_session`.
- Production must set `SESSION_SECRET` to a random 32+ character value. Development falls back to a local-only secret.
- The demo admin credential is intentionally centralized in `src/lib/demo-account.ts`. Do not duplicate it in route handlers or UI.
- Cookie writes should use `httpOnly`, `sameSite: "lax"`, `path: "/"`, a 7 day `maxAge`, and `secure` in production.
- Social login starts in `src/app/api/auth/social/route.ts`, redirects through Supabase, then returns to `src/app/api/auth/callback/route.ts` to exchange the code and mint the app session.
- Stripe webhooks must stay outside auth middleware. They are protected by Stripe signatures, not by app sessions.

## Safe Redirects

- Use `getSafeRedirectPath()` from `src/lib/session-cookie.ts` for `next` params.
- Never redirect to raw user input or external origins from auth flows.

## Current Gaps

- Subscription state is not yet read from Supabase to assign a paid plan after Stripe checkout.
