/**
 * Speech-only text normalization applied right before edge-TTS synthesis
 * (src/app/api/studio/tts/route.ts). It is the code safety-net for TTS issues
 * #15/#16/#21: an English voice mis-reads "₹10Cr" as "rupee ten C R", "99.9%" as
 * "ninety nine point nine", "API" as "appy", and raw code punctuation letter by
 * letter. This expands symbols and unit abbreviations to spoken words while KEEPING
 * the digits (edge-tts reads "40" correctly — only the symbols mislead it).
 *
 * It runs ONLY on the voiced copy. Captions are built separately from the original
 * beat text (src/studio/captions.ts), so the screen keeps "₹10Cr" / "API" while the
 * voice hears "ten crore rupees" / "A P I". Phonetic spelling of arbitrary proper
 * nouns and homograph/emphasis intent stay the model's job (TTS_RULES in prompt.ts);
 * this handles only what is deterministic and reversible.
 */

/** Acronyms edge-tts should SPELL letter by letter (spaces force it). */
const SPELL_ACRONYMS = [
  "API", "AWS", "GCP", "SDK", "CLI", "CPU", "GPU", "RAM", "ROM", "SSD", "HDD",
  "HTTP", "HTTPS", "URL", "URI", "XML", "HTML", "CSS", "TCP", "UDP", "IP", "DNS",
  "SSH", "SSL", "TLS", "CDN", "VPN", "ORM", "JWT", "OS", "UI", "UX", "IDE", "OTP",
  "RBI", "GDP", "GST", "UPI", "IPO", "CEO", "CFO", "CTO", "FDI", "NPA", "IPC", "FIR",
  "PDF", "USB", "GPS", "LED", "ATM", "AI", "ML", "DB",
];

/** Acronyms said AS a word — written phonetically so edge-tts doesn't spell them. */
const WORD_ACRONYMS: Record<string, string> = {
  SQL: "Sequel", NoSQL: "No Sequel", NASA: "Nassa", ISRO: "Iss-ro", UNESCO: "You-ness-co",
  NATO: "Nay-toh", GIF: "Gif", JSON: "Jason", JPEG: "Jay-peg", PNG: "P N G", SaaS: "Sass",
};

/** Number-attached units → spoken word (longest alternatives first so GHz beats Hz). */
const UNIT_WORDS: Array<[RegExp, string]> = [
  [/\b(\d[\d.,]*)\s?GHz\b/g, "$1 gigahertz"],
  [/\b(\d[\d.,]*)\s?MHz\b/g, "$1 megahertz"],
  [/\b(\d[\d.,]*)\s?Hz\b/g, "$1 hertz"],
  [/\b(\d[\d.,]*)\s?Gbps\b/g, "$1 gigabits per second"],
  [/\b(\d[\d.,]*)\s?Mbps\b/g, "$1 megabits per second"],
  [/\b(\d[\d.,]*)\s?Kbps\b/g, "$1 kilobits per second"],
  [/\b(\d[\d.,]*)\s?GB\b/g, "$1 gigabytes"],
  [/\b(\d[\d.,]*)\s?MB\b/g, "$1 megabytes"],
  [/\b(\d[\d.,]*)\s?KB\b/g, "$1 kilobytes"],
  [/\b(\d[\d.,]*)\s?TB\b/g, "$1 terabytes"],
  [/\b(\d[\d.,]*)\s?ms\b/g, "$1 milliseconds"],
  [/\b(\d[\d.,]*)\s?km\b/g, "$1 kilometres"],
  [/\b(\d[\d.,]*)\s?kg\b/g, "$1 kilograms"],
];

// Explicit .ts extension, for the same reason pacing.ts carries one:
// scripts/lexicon-check.mjs imports this module directly and relies on Node 22
// stripping the types. Keep it.
import { INDIAN_TERMS, TECH_TERMS } from "./lexicon.ts";

/* ─────────────────────────────── Hindi ──────────────────────────────────────
 * Hindi used to get two symbol replacements and an early return, so a Hindi
 * video saying "API" or "100ms" got nothing at all (row 12.5). It now has the
 * same coverage as English, in Devanagari — which is the point: handing a
 * Hindi voice the English word "milliseconds" is the failure this avoids.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Bare currency/percent. */
const HI_SYMBOLS: Array<[RegExp, string]> = [
  [/(\d[\d.,]*)\s?%/g, "$1 प्रतिशत"],
  [/₹\s?(\d[\d.,]*)/g, "$1 रुपये"],
];

/** Devanagari letter names, so a spelled acronym stays in the voice's own script. */
const HI_LETTERS: Record<string, string> = {
  A: "ए", B: "बी", C: "सी", D: "डी", E: "ई", F: "एफ", G: "जी", H: "एच", I: "आई",
  J: "जे", K: "के", L: "एल", M: "एम", N: "एन", O: "ओ", P: "पी", Q: "क्यू", R: "आर",
  S: "एस", T: "टी", U: "यू", V: "वी", W: "डब्ल्यू", X: "एक्स", Y: "वाई", Z: "ज़ेड",
};

/** Acronyms said as a word rather than spelled. */
const HI_WORD_ACRONYMS: Record<string, string> = {
  SQL: "सीक्वल", NoSQL: "नो सीक्वल", NASA: "नासा", ISRO: "इसरो", UNESCO: "यूनेस्को",
  NATO: "नाटो", GIF: "जिफ़", JSON: "जेसन", JPEG: "जेपेग", SaaS: "सास",
};

/** Number-attached units → Devanagari (longest alternatives first, as in English). */
const HI_UNIT_WORDS: Array<[RegExp, string]> = [
  [/\b(\d[\d.,]*)\s?GHz\b/g, "$1 गीगाहर्ट्ज़"],
  [/\b(\d[\d.,]*)\s?MHz\b/g, "$1 मेगाहर्ट्ज़"],
  [/\b(\d[\d.,]*)\s?Hz\b/g, "$1 हर्ट्ज़"],
  [/\b(\d[\d.,]*)\s?Gbps\b/g, "$1 गीगाबिट प्रति सेकंड"],
  [/\b(\d[\d.,]*)\s?Mbps\b/g, "$1 मेगाबिट प्रति सेकंड"],
  [/\b(\d[\d.,]*)\s?Kbps\b/g, "$1 किलोबिट प्रति सेकंड"],
  [/\b(\d[\d.,]*)\s?GB\b/g, "$1 गीगाबाइट"],
  [/\b(\d[\d.,]*)\s?MB\b/g, "$1 मेगाबाइट"],
  [/\b(\d[\d.,]*)\s?KB\b/g, "$1 किलोबाइट"],
  [/\b(\d[\d.,]*)\s?TB\b/g, "$1 टेराबाइट"],
  [/\b(\d[\d.,]*)\s?ms\b/g, "$1 मिलीसेकंड"],
  [/\b(\d[\d.,]*)\s?km\b/g, "$1 किलोमीटर"],
  [/\b(\d[\d.,]*)\s?kg\b/g, "$1 किलोग्राम"],
];

/** Magnitudes, for "₹1.2Cr" written the Indian way inside Hindi copy. */
const HI_MAGNITUDES: Record<string, string> = {
  cr: "करोड़", crore: "करोड़", lakh: "लाख", l: "लाख", k: "हज़ार",
};

function normalizeHindi(text: string): string {
  let s = text;

  // Currency first: "₹1.2Cr" must become "1.2 करोड़ रुपये", not "1.2 रुपये Cr".
  s = s.replace(/(?:₹\s?|\bRs\.?\s?)(\d[\d,]*\.?\d*)(?:\s?(Cr|crore|Lakh|lakh|L|K))?\b/g, (_m, num, unit) => {
    const suffix = unit ? ` ${HI_MAGNITUDES[unit.toLowerCase()] ?? unit}` : "";
    return `${num}${suffix} रुपये`;
  });
  s = s.replace(/\$\s?(\d[\d,]*\.?\d*)/g, "$1 डॉलर");
  for (const [re, w] of HI_SYMBOLS) s = s.replace(re, w);
  s = s.replace(/%/g, " प्रतिशत").replace(/₹/g, " रुपये ");
  for (const [re, w] of HI_UNIT_WORDS) s = s.replace(re, w);

  for (const [acr, say] of Object.entries(HI_WORD_ACRONYMS)) {
    s = s.replace(new RegExp(`\\b${acr}\\b`, "g"), say);
  }
  for (const acr of SPELL_ACRONYMS) {
    const spelled = acr.split("").map((c) => HI_LETTERS[c] ?? c).join(" ");
    s = s.replace(new RegExp(`\\b${acr}\\b`, "g"), spelled);
  }

  s = s.replace(/\s=\s/g, " बराबर ").replace(/&/g, " और ").replace(/(\w)\+(\w)/g, "$1 प्लस $2");

  return collapseCurrencyEcho(s).replace(/\s{2,}/g, " ").trim();
}

/**
 * "₹42000 रुपये" is natural Hindi and expands to "42000 रुपये रुपये". Same in
 * English for "₹500 rupees". Collapse the echo rather than trying to make the
 * currency pattern swallow a word that may or may not follow it.
 */
function collapseCurrencyEcho(text: string): string {
  return text.replace(/\b(rupees|dollars)(\s+\1\b)+/gi, "$1").replace(/(रुपये|डॉलर)(\s+\1)+/g, "$1");
}

function expandCurrency(text: string): string {
  // ₹1.2Cr / ₹10 Cr / ₹500 / Rs. 500  (digits kept; magnitude + "rupees" spoken)
  const mag: Record<string, string> = { cr: "crore", crore: "crore", lakh: "lakh", l: "lakh", k: "thousand" };
  return text
    // Case-sensitive with a boundary before "Rs" so it never matches the "rs" inside a
    // word like "cars 5". ₹ is a symbol, so no boundary needed there.
    .replace(/(?:₹\s?|\bRs\.?\s?)(\d[\d,]*\.?\d*)(?:\s?(Cr|crore|Lakh|lakh|L|K))?\b/g, (_m, num, unit) => {
      const suffix = unit ? ` ${mag[unit.toLowerCase()] ?? unit}` : "";
      return `${num}${suffix} rupees`;
    })
    .replace(/₹/g, " rupees ");
}

/**
 * Normalize a spoken beat for the given content language. Both languages now get
 * the full treatment — acronyms, units, currency, symbols — each in its own
 * script, so no English word is ever injected into a Hindi voice.
 */
export function normalizeSpeech(
  text: string,
  lang: "en" | "hi" = "en",
  opts: { nativeIndianVoice?: boolean } = {}
): string {
  let s = text;

  // Code punctuation that occasionally leaks into narration (issue #21 backstop).
  s = s.replace(/=>/g, " to ").replace(/`/g, "");

  // Hindi is voiced by a Hindi speaker, so it needs no phonetic respelling of
  // Indian names — the reason INDIAN_TERMS is skipped for en-IN voices applies
  // here a fortiori.
  if (lang === "hi") return normalizeHindi(s);

  // Respellings authored for an American ear would over-correct a voice that
  // already says these names natively (row 12.4). Technical names are respelled
  // either way: no voice knows nginx is "engine X".
  if (!opts.nativeIndianVoice) {
    for (const [re, w] of INDIAN_TERMS) s = s.replace(re, w);
  }
  for (const [re, w] of TECH_TERMS) s = s.replace(re, w);

  s = expandCurrency(s);
  s = s.replace(/\$\s?(\d[\d,]*\.?\d*)/g, "$1 dollars");
  s = s.replace(/(\d[\d.,]*)\s?%/g, "$1 percent").replace(/%/g, " percent");
  for (const [re, w] of UNIT_WORDS) s = s.replace(re, w);

  for (const [acr, say] of Object.entries(WORD_ACRONYMS)) {
    s = s.replace(new RegExp(`\\b${acr}\\b`, "g"), say);
  }
  for (const acr of SPELL_ACRONYMS) {
    s = s.replace(new RegExp(`\\b${acr}\\b`, "g"), acr.split("").join(" "));
  }

  s = s.replace(/\s=\s/g, " equals ").replace(/&/g, " and ").replace(/(\w)\+(\w)/g, "$1 plus $2");

  return collapseCurrencyEcho(s).replace(/\s{2,}/g, " ").trim();
}
