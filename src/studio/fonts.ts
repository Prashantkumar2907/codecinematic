import { FONT_SANS } from "./painters/common";

/** The webfont in the stack; everything after the first comma is a fallback. */
const FAMILY = FONT_SANS.split(",")[0].trim();
/** Every weight a painter, caption style or overlay asks for. */
const WEIGHTS = [400, 500, 600, 700, 800, 900];

let pending: Promise<void> | null = null;

/**
 * Resolve once the studio typeface is actually available to canvas.
 *
 * Setting `ctx.font` does NOT trigger a webfont fetch — the CSS `@import` in
 * globals.css only loads the face for DOM text, and no DOM element uses it. A
 * render that starts before the face lands therefore draws in whatever system
 * fallback the machine has (`-apple-system` / `Segoe UI` / `Roboto`), which
 * breaks the "same script → identical re-render" guarantee and invalidates every
 * `fitFontSize`/`wrapText` measurement, since those were tuned to this face's
 * metrics. Await this before the first painted frame.
 */
export function ensureStudioFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  pending ??= (async () => {
    await Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} 48px ${FAMILY}`)));
    await document.fonts.ready;
  })();
  return pending;
}
