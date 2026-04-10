export const FONT_CATALOG = [
  { name: "Playfair Display", style: "serif", google: true },
  { name: "Lora", style: "serif", google: true },
  { name: "Merriweather", style: "serif", google: true },
  { name: "Cormorant Garamond", style: "serif", google: true },
  { name: "DM Serif Display", style: "serif", google: true },
  { name: "Crimson Text", style: "serif", google: true },
  { name: "EB Garamond", style: "serif", google: true },
  { name: "Space Grotesk", style: "sans-serif", google: true },
  { name: "Outfit", style: "sans-serif", google: true },
  { name: "Sora", style: "sans-serif", google: true },
  { name: "DM Sans", style: "sans-serif", google: true },
  { name: "Nunito", style: "sans-serif", google: true },
  { name: "JetBrains Mono", style: "monospace", google: true },
  { name: "Georgia", style: "serif", google: false },
  { name: "Times New Roman", style: "serif", google: false },
] as const;

export type FontEntry = (typeof FONT_CATALOG)[number];

/** Inject Google Fonts stylesheet once (idempotent) */
export function loadGoogleFonts() {
  const id = "cc-google-fonts";
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const googleFonts = FONT_CATALOG.filter((f) => f.google).map((f) =>
    f.name.replace(/ /g, "+")
  );
  const families = googleFonts
    .map((f) => `family=${f}:ital,wght@0,400;0,700;1,400;1,700`)
    .join("&");
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}
