# Project Claude Instructions

This directory contains project-specific Claude skills for CodeCinematic. It exists so future sessions can load precise guidance for this repo's actual Next.js App Router, Supabase, Zustand, Tailwind, and browser-rendering patterns instead of relying on generic defaults.

Claude uses a three-layer model:

1. Global skills in `~/.claude/skills` provide personal or organization-wide behavior.
2. Project skills in `.claude/skills` capture CodeCinematic-specific workflows and invariants.
3. `CLAUDE.md` is the always-loaded cockpit view with the commands, structure, and non-negotiable rules for every session.

Claude MUST read the relevant `SKILL.md` before acting on any task in that domain. If a task crosses domains, load each relevant skill before changing files.

## Skill Index

| Skill | Description | When to load |
|---|---|---|
| `architecture` | File placement, route ownership, and naming rules for the App Router project. | Adding files, routes, components, shared helpers, or moving code. |
| `api-conventions` | API handler envelopes, Zod validation, Supabase fallback, and ownership checks. | Adding or changing anything under `src/app/api`. |
| `ui-conventions` | Tailwind tokens, local UI primitives, motion, responsive, and async-state rules. | Building or editing React UI. |
| `state-management` | Zustand editor store, local panel state, and URL tab-state rules. | Working with drafts, recent projects, editor settings, or workspace tabs. |
| `auth` | Signed app sessions, demo login, Supabase OAuth, middleware, and protected routes. | Touching login, cookies, redirects, guards, or auth-sensitive APIs. |
| `new-feature` | End-to-end feature checklist across route, UI, state, API, database, and verification. | Starting a new workflow or user-facing capability. |
| `deployment` | Verified setup, env vars, Supabase, Stripe, Resend, PWA, and Vercel deployment notes. | Building, releasing, or debugging environments. |
| `domain-database` | Supabase tables, RLS, indexes, constraints, trigger, and seed invariants. | Editing `supabase/update_001.sql` or persistence behavior. |
| `domain-rendering` | Browser Canvas/MediaRecorder render engine and creator-panel video rules. | Editing video generation, audio sync, captions, render timing, or creator panels. |
| `domain-plans-billing` | Plan codes, limits, watermarks, Stripe checkout, and subscription gaps. | Changing plans, quotas, pricing, export watermarking, or billing. |
