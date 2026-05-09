---
name: deployment
description: Load when building, releasing, configuring environments, or debugging CodeCinematic deployment, Supabase, Stripe, Resend, or PWA behavior.
---

# Deployment

## When to use this skill
Use this for deployment setup, environment variables, production build failures, Vercel/Supabase/Stripe/Resend configuration, or PWA cache behavior.

## Quick reference
- Deployment guide: `deployment.md`
- Env example: `.env.example`
- Build command: `npm run build`
- Start command: `npm run start`
- SQL bootstrap: `supabase/update_001.sql`
- Security headers: `next.config.mjs`
- Service worker: `public/sw.js`
- Manifest: `public/manifest.webmanifest`

## Local and production commands
| Task | Command |
|---|---|
| Install | `npm install` |
| Local dev | `npm run dev` |
| Typecheck/lint | `npm run lint` |
| Production build | `npm run build` |
| Production start | `npm run start` |

`package.json` defines `lint` as `npm run typecheck`, and `typecheck` runs `next typegen && tsc --noEmit`.

## Environment variables
Public/client-readable:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Server-only:
- `SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_MEDIUM`, `STRIPE_PRICE_HIGH`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `GOOGLE_AI_API_KEY`, `SARVAM_API_KEY`

## Platform setup
- `deployment.md` names Vercel as the recommended deployment target.
- Supabase SQL editor should run `supabase/update_001.sql`.
- Supabase Storage buckets documented in deployment guide: `cc-project-assets` and `cc-project-exports`, both private.
- Supabase auth redirect URLs must include local and production `/api/auth/callback`.
- Stripe webhook endpoint is `/api/billing/webhook` and should listen for checkout/subscription events listed in `deployment.md`.
- Resend sends email from `RESEND_FROM_EMAIL` through `src/app/api/email/send/route.ts`.

## Security and PWA
- `next.config.mjs` sets COEP/COOP, referrer policy, `nosniff`, `DENY` frame policy, and a limited permissions policy.
- `public/sw.js` caches app shell/static assets but explicitly avoids `/api`, `/dashboard`, and `/projects`.

## Do not
- Do not commit real `.env` values.
- Do not cache protected workspace/API routes in the service worker.
- Do not claim CI/CD exists; there is no `.github/workflows`, Dockerfile, or CI config in this repo.
- Do not claim subscription sync is complete; webhook handlers currently log verified events but do not update subscriptions.
