import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import type { Narration } from "@/lib/narration";

const bodySchema = z.object({
  code: z.string().min(1).max(50_000),
  language: z.string().min(1).max(30),
  title: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || apiKey.startsWith("YOUR_")) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY is not configured" },
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

  const { code, language, title } = parsed.data;
  const codeLines = code.split("\n");
  const totalLines = codeLines.length;

  const prompt = `You are a technical video narrator for a code tutorial platform called CodeCinematic.

Given the following ${language} code titled "${title}", generate a narration script that will be spoken as an audio voiceover while the code is typed line by line on screen.

CODE (${totalLines} lines):
\`\`\`${language}
${code}
\`\`\`

Generate a JSON response with this exact structure:
{
  "intro": "A 1-2 sentence introduction spoken before code starts (keep it concise, ~5 seconds of speech)",
  "segments": [
    {
      "lineStart": 1,
      "lineEnd": 3,
      "text": "What to say while lines 1-3 are typing on screen"
    }
  ],
  "outro": "A 1 sentence wrap-up spoken after all code is shown"
}

RULES:
- Each segment covers a logical group of related lines (2-6 lines each).
- segments must cover ALL ${totalLines} lines with no gaps and no overlaps.
- lineStart and lineEnd are 1-based.
- Each segment text should be 1-3 sentences, conversational, explaining what the code does.
- Use natural spoken language — it will be converted to speech audio.
- Comments in the code (lines starting with // or #) should be narrated as explanations, not read literally.
- Keep total narration under 60 seconds of estimated speech for typical code.
- Return ONLY valid JSON, no markdown fences, no extra text.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json(
        { error: "Failed to generate commentary" },
        { status: 502 }
      );
    }

    const geminiData = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse the JSON from the LLM response
    let narration: Narration;
    try {
      // Strip markdown code fences if present
      const cleaned = rawText
        .replace(/^```json?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      narration = JSON.parse(cleaned) as Narration;
    } catch {
      console.error("Failed to parse Gemini response as JSON:", rawText);
      return NextResponse.json(
        { error: "LLM returned invalid JSON" },
        { status: 502 }
      );
    }

    // Validate structure
    if (
      !narration.intro ||
      !Array.isArray(narration.segments) ||
      narration.segments.length === 0
    ) {
      return NextResponse.json(
        { error: "LLM returned an incomplete narration" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, narration });
  } catch (err) {
    console.error("Commentary generation error:", err);
    return NextResponse.json(
      { error: "Failed to connect to AI service" },
      { status: 500 }
    );
  }
}
