# Security Checklist

## Session And Auth

- Use `getSession()` for app-session authorization in server components and route handlers.
- Use `getSafeRedirectPath()` for every `next` redirect target.
- Never hand-roll or decode `codecinematic_session`; use `encodeSession()` and `decodeSessionCookie()`.
- Keep `/api/billing/webhook` public to app sessions. Its trust boundary is the Stripe signature.

## Secrets

- Do not expose server secrets to client components.
- Treat `.env.example` as placeholders only. Do not write real keys into docs, logs, UI, or commits.
- Production requires a 32+ character `SESSION_SECRET`.

## API Boundaries

- Validate request bodies with Zod before any database call.
- Return the standard `apiError()` envelope for JSON route failures.
- For Supabase-backed writes, verify the Supabase user context and ownership before inserting child records.
- Avoid logging full Stripe metadata because it can include customer email or plan details.

## Browser And PWA

- The service worker must not cache `/api`, `/dashboard`, or `/projects`.
- Keep security headers in `next.config.mjs` conservative unless a browser API requires a change.
- When adding a new browser API, update `Permissions-Policy` intentionally.
