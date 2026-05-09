# Security Checklist

## Session And Auth

- Use `getSession()` for app-session authorization in server components and route handlers.
- Do not rely on middleware as the only auth check. Middleware handles fast missing-cookie redirects; every protected route/page must revalidate the signed session server-side.
- Use `getSafeRedirectPath()` for every `next` redirect target.
- Never hand-roll or decode `codecinematic_session`; use `encodeSession()` and `decodeSessionCookie()`.
- Validate login payloads server-side and keep credential failures generic.
- Local login throttling is in-process only. Production deployments with multiple instances need shared rate limiting.
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
- Log booleans or internal ids for webhook diagnostics instead of raw customer emails, metadata objects, or full payloads.

## Browser And PWA

- The service worker must not cache `/api`, `/dashboard`, or `/projects`.
- Keep security headers in `next.config.mjs` conservative unless a browser API requires a change.
- When adding a new browser API, update `Permissions-Policy` intentionally.
