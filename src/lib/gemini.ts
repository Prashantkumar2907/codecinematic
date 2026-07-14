import { geminiUsageToday, recordGeminiRequest } from "@/lib/state";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1500;
const RATE_LIMIT_WAIT_MS = 25_000;
/** Output ceilings: a short script is ~2-3k tokens, a long ~8-10k. 32k just let a
 *  thinking model spend minutes; capping it bounds latency and cost. */
const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 12288;
/** Bounds a thinking model's reasoning time. Unset (undefined) keeps model default;
 *  set GEMINI_THINKING_BUDGET=0 to disable thinking for the fastest structured output. */
const THINKING_BUDGET = process.env.GEMINI_THINKING_BUDGET !== undefined
  ? Number(process.env.GEMINI_THINKING_BUDGET)
  : undefined;
/** The free key surfaces bursts as 404/429; when the whole chain is rate-limited we
 *  wait and retry the chain rather than failing, up to this budget. */
const RATE_LIMIT_TOTAL_BUDGET_MS = 120_000;

/** Free-tier requests/day per model (AI Studio dashboard); unknown models assume the common 20. */
const MODEL_DAILY_LIMITS: Record<string, number> = {
  "gemini-3.5-flash": 20,
  "gemini-3-flash-preview": 20,
  "gemini-2.5-flash": 20,
  "gemini-3.1-flash-lite": 500,
  "gemini-2.5-flash-lite": 20,
};
const DEFAULT_DAILY_LIMIT = 20;

/*
 * Scripts want the strongest model available; topics are easy, so they start on the
 * high-quota lite models and leave the 20/day flagship slots for script generation.
 * A 429 hands the request to the next model in the chain.
 */
const QUALITY_CHAIN = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];
const LITE_FIRST = ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];

export type ModelTier = "quality" | "fast";

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

/** GEMINI_API_KEY may hold several comma-separated keys; rotating between them
 *  multiplies the free-tier daily quota and lets a 429 on one key fall through
 *  to the next instead of stalling the whole chain. */
function apiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY;
  if (!raw) throw new GeminiError("GEMINI_API_KEY is not set in .env.local");
  const keys = raw.split(",").map((k) => k.trim()).filter(Boolean);
  if (!keys.length) throw new GeminiError("GEMINI_API_KEY is empty");
  return keys;
}

function dedupe(models: string[]): string[] {
  return [...new Set(models)];
}

function chainFromEnv(name: string): string[] | null {
  const list = process.env[name]
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list?.length ? list : null;
}

export function geminiModels(tier: ModelTier = "quality"): string[] {
  const quality =
    chainFromEnv("GEMINI_MODELS") ??
    (process.env.GEMINI_MODEL ? dedupe([process.env.GEMINI_MODEL, ...QUALITY_CHAIN]) : QUALITY_CHAIN);
  if (tier === "quality") return quality;
  return chainFromEnv("GEMINI_MODELS_FAST") ?? dedupe([...LITE_FIRST, ...quality]);
}

export type QuotaSnapshot = {
  used: number;
  limit: number;
  perModel: { model: string; used: number; limit: number }[];
};

export async function geminiQuotaSnapshot(): Promise<QuotaSnapshot> {
  const usage = await geminiUsageToday();
  const models = dedupe([...geminiModels("quality"), ...geminiModels("fast"), ...Object.keys(usage)]);
  const perModel = models.map((model) => ({
    model,
    used: usage[model] ?? 0,
    limit: MODEL_DAILY_LIMITS[model] ?? DEFAULT_DAILY_LIMIT,
  }));
  return {
    used: perModel.reduce((sum, m) => sum + m.used, 0),
    limit: perModel.reduce((sum, m) => sum + m.limit, 0),
    perModel,
  };
}

/**
 * One generateContent call expecting a JSON body back. Walks the model chain; if
 * every model is rate-limited (429/404) — which happens because they share one
 * free-tier key — it backs off and retries the whole chain within a time budget
 * instead of failing instantly.
 */
export async function generateJson(prompt: string, tier: ModelTier = "quality"): Promise<unknown> {
  const models = geminiModels(tier);
  const deadline = Date.now() + RATE_LIMIT_TOTAL_BUDGET_MS;
  let round = 0;
  let lastError: unknown;
  for (;;) {
    let allRateLimited = true;
    for (let i = 0; i < models.length; i++) {
      try {
        return await generateWithModel(models[i], prompt, i === models.length - 1);
      } catch (err) {
        // Auth problems fail every model identically — surface immediately.
        if (err instanceof GeminiError && (err.status === 401 || err.status === 403)) throw err;
        // A genuine non-rate-limit failure (bad request, parse error) means this
        // model answered but we couldn't use it — try the next, but don't treat
        // the round as "purely rate-limited" so we don't loop forever on it.
        if (!(err instanceof GeminiError && err.status === 429)) allRateLimited = false;
        lastError = err;
      }
    }
    if (!allRateLimited || Date.now() >= deadline) break;
    const wait = Math.min(RATE_LIMIT_WAIT_MS * 2 ** round, 40_000, Math.max(0, deadline - Date.now()));
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, wait));
    round++;
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  const rateLimited = lastError instanceof GeminiError && lastError.status === 429;
  throw new GeminiError(
    rateLimited
      ? `Gemini free-tier rate limit — all models throttled after ${Math.round(RATE_LIMIT_TOTAL_BUDGET_MS / 1000)}s. Wait a minute and retry, or set a paid GEMINI_API_KEY. (last: ${detail})`
      : `all models failed (${models.join(" → ")}) — last: ${detail}`,
    lastError instanceof GeminiError ? lastError.status : undefined
  );
}

async function generateWithModel(model: string, prompt: string, _isLastModel: boolean): Promise<unknown> {
  const keys = apiKeys();
  let lastError: unknown;

  // Try each key for this model; a 429/404 on one key rotates to the next before
  // the caller advances to the next model. 5xx/network retries the same key.
  for (const key of keys) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${key}`;
    let rateLimited = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.7,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              ...(THINKING_BUDGET !== undefined ? { thinkingConfig: { thinkingBudget: THINKING_BUDGET } } : {}),
            },
          }),
        });
        // Only a real 200 consumes a daily slot. 429 (quota gate) and 404 (free-tier
        // throttle — this API surfaces bursts as 404, not 429) consume nothing.
        if (res.ok) await recordGeminiRequest(model).catch(() => {});
        // 404 here means "model temporarily unavailable / throttled for this key",
        // not "wrong model name" — treat it like a 429 and rotate to the next key.
        if (res.status === 429 || res.status === 404) {
          const body = await res.text();
          const retryDelay = body.match(/"retryDelay":\s*"(\d+)/)?.[1];
          lastError = new GeminiError(
            `Gemini ${res.status} on ${model}: ${body.slice(0, 200) || "(empty body — free-tier rate limit)"}${
              retryDelay ? ` — retry in ${retryDelay}s` : ""
            }`,
            429
          );
          rateLimited = true;
          break; // stop retrying this key; move to the next key
        }
        if (res.status >= 500) {
          lastError = new GeminiError(`Gemini ${res.status} on ${model}: ${(await res.text()).slice(0, 300)}`, res.status);
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
          continue;
        }
        if (!res.ok) {
          throw new GeminiError(`Gemini ${res.status} on ${model}: ${(await res.text()).slice(0, 500)}`, res.status);
        }
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (!text) {
          throw new GeminiError(
            `${model} returned no text (finishReason: ${data.candidates?.[0]?.finishReason ?? "unknown"})`
          );
        }
        return JSON.parse(stripFences(text));
      } catch (err) {
        // Any 4xx (bad request, unsupported feature) goes to the caller; 5xx/network/
        // parse errors retry this key first.
        if (err instanceof GeminiError && err.status !== undefined && err.status < 500) throw err;
        lastError = err;
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    // A non-rate-limit failure exhausted this key's retries — advance the chain.
    if (!rateLimited) throw lastError instanceof Error ? lastError : new GeminiError(String(lastError));
    // Otherwise this key is throttled; loop to the next key.
  }
  // Every key is throttled for this model — hand a 429 to the caller's chain/backoff.
  throw lastError instanceof Error ? lastError : new GeminiError(String(lastError));
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
