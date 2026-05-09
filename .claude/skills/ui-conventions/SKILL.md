---
name: ui-conventions
description: Load when building or editing CodeCinematic React UI, Tailwind styling, feedback states, motion, or accessibility behavior.
---

# UI Conventions

## When to use this skill
Use this for UI under `src/components`, page components under `src/app`, route loading/error states, and editor/creator controls.

## Quick reference
- Design tokens: `src/app/globals.css`, `tailwind.config.ts`
- UI primitives: `src/components/ui/*`
- Class composition: `src/lib/cn.ts`
- Route motion: `src/components/layout/page-transition.tsx`
- Tab motion: `src/components/editor/project-workspace.tsx`
- Async states: `src/components/ui/feedback-state.tsx`, `src/components/editor/shared/render-status-panel.tsx`

## Styling rules
- Use Tailwind classes and CSS variables such as `bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`.
- Compose conditional classes with `cn()`.
- Prefer local primitives before adding dependencies: `Button`, `buttonVariants`, `Card`, `Input`, `Textarea`, `Badge`, `Skeleton`.
- Button-like `Link` or `a` elements should receive `buttonVariants()` directly; do not wrap interactive elements inside each other.
- The app is dark-first and work-surface dense; dashboard/editor pages should remain scroll-contained with `app-scroll`.

## Layout and responsive behavior
- App shell in `src/app/layout.tsx` is a flex column with `SiteHeader`, `InstallPrompt`, and `PageTransition`.
- Protected editor pages use `max-w-[100rem]`, `min-h-0`, and explicit overflow containers.
- Creator panels use two-column desktop grids and stacked scrollable mobile layouts.
- `rounded-xl` and `rounded-2xl` both map to `0.5rem` in `tailwind.config.ts`.

## Motion and feedback states
- Use Framer Motion for route, nav, menu, and tab transitions.
- Respect reduced motion with `useReducedMotion`, as in `PageTransition` and `ProjectWorkspace`.
- Route-level loading/error files should use `LoadingState` and `ErrorState`.
- Browser render flows should use `RenderStatusPanel` for empty/loading/error/success statuses.

## Accessibility minimums
- Controls need native labels or `aria-label`.
- Toggle-like buttons need `aria-pressed`.
- Menus need roles and Escape behavior following `src/components/layout/profile-menu.tsx`.
- Status panels should expose `role="status"` or `role="alert"` and `aria-live` when state changes matter.

## Do not
- Do not add a separate styling system or CSS module pattern.
- Do not add decorative gradient orbs; existing pages use restrained grids, bands, cards, and real editor previews.
- Do not create nested cards or nested interactive `Button`/`Link` markup.
- Do not leave async UI without loading, empty, error, and success behavior when users can trigger a workflow.
