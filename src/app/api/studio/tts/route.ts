import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeSpeech } from "@/lib/speech";
import { isNativeIndianVoice } from "@/lib/lexicon";
import { activeSynthesizer } from "@/lib/tts";

const prosodyPercent = z.string().regex(/^[+-]\d{1,3}%$/);
const prosodyHz = z.string().regex(/^[+-]\d{1,3}Hz$/);

const requestSchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1).max(520),
        /** Per-beat delivery (row 12.2) — a question lifts, a payoff drops. */
        rate: prosodyPercent.optional(),
        pitch: prosodyHz.optional(),
        volume: prosodyPercent.optional(),
      })
    )
    .min(1)
    .max(160),
  voice: z.string().optional(),
  /** Batch defaults, e.g. shorts run at "+5%". */
  rate: prosodyPercent.optional(),
  pitch: prosodyHz.optional(),
  volume: prosodyPercent.optional(),
});

const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural";

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "expected {segments:[{id,text,rate?,pitch?,volume?}], voice?, rate?, pitch?, volume?}" },
      { status: 400 }
    );
  }
  const { segments, rate, pitch, volume } = parsed.data;
  const voice = parsed.data.voice || process.env.VOICE || DEFAULT_VOICE;
  // The voice prefix encodes the language (hi-IN-… / en-US-…); the speech normalizer
  // needs it to avoid injecting English words into a Hindi voice.
  const lang: "en" | "hi" = voice.toLowerCase().startsWith("hi") ? "hi" : "en";
  const nativeIndianVoice = isNativeIndianVoice(voice);

  try {
    const results = await activeSynthesizer().synthesize(
      segments.map((s) => ({ ...s, text: normalizeSpeech(s.text, lang, { nativeIndianVoice }) })),
      { voice, rate, pitch, volume }
    );
    return NextResponse.json({
      voice,
      segments: results.map((r) => ({
        id: r.id,
        mp3Base64: r.mp3.toString("base64"),
        // Timed against the NORMALIZED copy, so the word list will not match the
        // caption text token-for-token ("API" is spoken as three words). Consumers
        // must use it as a rhythm curve, not an index — see `activeCaption`.
        words: r.words,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 400) }, { status: 502 });
  }
}
