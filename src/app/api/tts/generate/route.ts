import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";

const bodySchema = z.object({
  text: z.string().min(1).max(10_000),
  language: z.string().default("en-IN"),
  speaker: z.string().default("meera"),
  pace: z.number().min(0.5).max(2.0).default(1.0),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || apiKey.startsWith("YOUR_")) {
    return NextResponse.json(
      { error: "SARVAM_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { text, language, speaker, pace } = parsed.data;

  try {
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: language,
        speaker,
        model: "bulbul:v2",
        pitch: 0,
        pace,
        loudness: 1.5,
        speech_sample_rate: 22050,
        enable_preprocessing: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Sarvam API error:", errText);
      return NextResponse.json(
        { error: "TTS generation failed" },
        { status: 502 }
      );
    }

    const data = (await response.json()) as { audios?: string[] };

    if (!data.audios || data.audios.length === 0) {
      return NextResponse.json(
        { error: "No audio returned from TTS service" },
        { status: 502 }
      );
    }

    // Return base64 audio
    return NextResponse.json({
      ok: true,
      audioBase64: data.audios[0],
      format: "wav",
    });
  } catch (err) {
    console.error("TTS generation error:", err);
    return NextResponse.json(
      { error: "Failed to connect to TTS service" },
      { status: 500 }
    );
  }
}
