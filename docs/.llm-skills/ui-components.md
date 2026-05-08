# UI Components

## Critical Files

- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/feedback-state.tsx`
- `src/components/layout/page-transition.tsx`
- `src/components/editor/shared/render-status-panel.tsx`
- `src/app/globals.css`
- `tailwind.config.ts`

## Design Rules

- The app is dark-first and uses Tailwind CSS variables from `src/app/globals.css`.
- Prefer local UI primitives in `src/components/ui` before adding new dependencies.
- Use `cn()` from `src/lib/cn.ts` for conditional class composition.
- Use Lucide icons in icon buttons or compact action buttons.
- Keep dashboard/editor UI dense and work-focused. Avoid marketing-style cards inside cards.
- Use existing transition classes and Framer Motion for purposeful movement.
- Page-level motion lives in `PageTransition`; tab-level editor motion lives in `ProjectWorkspace`.
- `rounded-xl` and `rounded-2xl` are intentionally mapped to 8px in `tailwind.config.ts` to keep dense work surfaces crisp.
- Do not add decorative gradient orbs. Use restrained grids, bands, or real product/editor visuals.

## State Rules

Every user-facing async surface should model:

- Loading: use `LoadingState` or `Skeleton`
- Empty: use `EmptyState` or a local dashed empty panel
- Error: use `ErrorState` or a local destructive alert
- Success: show the resulting workflow/content clearly
- Render flows should use `RenderStatusPanel` for empty/loading/error/success status when possible.

Route-level states now exist for the dashboard and project editor paths. Add matching `loading.tsx` and `error.tsx` files when creating new App Router pages that fetch server context.

## Editor Notes

- `ProjectWorkspace` selects creator modes based on the `tab` search param.
- `ProjectEditor` stores drafts through Zustand in `src/lib/editor-store.ts`.
- `CreateVideoPanel` is currently large and mixes rendering, API calls, audio, tokenization, and UI. Prefer extracting new behavior into helpers instead of making that file larger.
- Keep inputs, selects, sliders, icon buttons, and swatches labelled with `aria-label`, `aria-pressed`, or native labels.
- Several creator panels duplicate canvas/font/render helpers. When changing one, check if the pattern should move into `src/components/editor/shared`.
