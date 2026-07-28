import { geminiUsageToday, geminiByKeyToday, recordGeminiRequest } from "@/lib/state";
import { repairJson } from "@/lib/jsonrepair";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1500;
const RATE_LIMIT_WAIT_MS = 25_000;
/** Output ceilings: a short script is ~2-3k tokens, a long ~8-10k. 32k just let a
 *  thinking model spend minutes; capping it bounds latency and cost. */
const MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 16384;
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
  "gemini-3.1-pro-preview": 20,
  "gemini-3.6-flash": 20,
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
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
];
const LITE_FIRST = ["gemini-3.1-flash-lite"];

/** Models the UI may pick from for content generation (probed 2026-07-18 on the
 *  billed keys; gemini-2.5-flash-lite dropped — 404 everywhere; gemini-2.5-pro
 *  works but is a slow, pricey thinking model, so it is opt-in, not in the chain).
 *  gemini-3.6-flash added 2026-07-23 — verified HTTP 200 on the billed key
 *  (serviceTier "standard", a thinking model); now the top quality choice. */
export const SELECTABLE_MODELS = [...QUALITY_CHAIN, "gemini-3.1-pro-preview", "gemini-2.5-pro"];

/** gemini-2.5-pro spends most of a small token budget on thinking, so a picked
 *  Pro model needs far more output headroom than the flash default. */
export const PRO_MODELS = new Set(["gemini-3.1-pro-preview", "gemini-2.5-pro"]);

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

export type KeyInfo = { id: string; label: string; billed: boolean };

/** Billed keys use Google's AIza… format; free-tier AI Studio keys are AQ.… */
function isBilledKey(key: string): boolean {
  return key.startsWith("AIza");
}

/** Keys eligible for rotation. With freeOnly (the automated-testing guard the content
 *  factory passes per request), billed keys are excluded so a run never falls through
 *  to a billed key; throws if that leaves nothing. Left off, the UI keeps its normal
 *  free-first-then-billed rotation. */
function rotationKeys(freeOnly: boolean): string[] {
  const keys = apiKeys();
  if (!freeOnly) return keys;
  const free = keys.filter((k) => !isBilledKey(k));
  if (!free.length) throw new GeminiError("freeOnly requested but no free-tier keys are configured", 400);
  return free;
}

/** Stable, secret-free labels for each configured key: "billed-1 (…Ym6w)".
 *  Billed keys are the AIza… format; free-tier keys are AQ.… — same split the
 *  probe used. The masked tail lets a human tell two keys of a kind apart. */
function keyList(): { key: string; info: KeyInfo }[] {
  const counts = { billed: 0, free: 0 };
  return apiKeys().map((key) => {
    const billed = isBilledKey(key);
    const n = billed ? ++counts.billed : ++counts.free;
    const id = `${billed ? "billed" : "free"}-${n}`;
    return { key, info: { id, label: `${id} (…${key.slice(-4)})`, billed } };
  });
}

/** Resolve a UI-picked key id back to the real key; null if it no longer exists. */
function resolveKeyId(id: string): string | null {
  return keyList().find((k) => k.info.id === id)?.key ?? null;
}

/** Label (e.g. "free-4", "billed-1") of the key that served a request — for the usage audit. */
function keyLabelOf(key: string): string {
  return keyList().find((k) => k.key === key)?.info.id ?? "unknown";
}

export type KeyModelStatus = "ok" | "exhausted" | "unavailable";
export type KeyProbe = KeyInfo & {
  exhausted: boolean;
  models: { model: string; status: KeyModelStatus }[];
};

let probeCache: { at: number; data: KeyProbe[] } | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

async function probeOne(key: string, model: string): Promise<KeyModelStatus> {
  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ok" }] }], generationConfig: { maxOutputTokens: 1 } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return "ok";
    if (res.status === 429) return "exhausted";
    if (res.status === 404) {
      // Empty-body 404 is a free-tier burst throttle; a message means the model is truly gone.
      const body = await res.text();
      return /no longer available|not found|not supported/i.test(body) ? "unavailable" : "exhausted";
    }
    return "unavailable";
  } catch {
    return "exhausted"; // timeout / network — treat as temporarily unusable
  }
}

/** Per-key × per-model availability for the UI picker. A key is "exhausted" when
 *  every model it CAN reach is currently rate-limited (so the UI disables it).
 *  Cached briefly — probing is 40+ tiny calls. */
export async function probeKeyModels(force = false): Promise<KeyProbe[]> {
  if (!force && probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) return probeCache.data;
  const data = await Promise.all(
    keyList().map(async ({ key, info }) => {
      const models = await Promise.all(SELECTABLE_MODELS.map(async (model) => ({ model, status: await probeOne(key, model) })));
      const reachable = models.filter((m) => m.status !== "unavailable");
      const exhausted = reachable.length > 0 && reachable.every((m) => m.status === "exhausted");
      return { ...info, exhausted, models };
    })
  );
  probeCache = { at: Date.now(), data };
  return data;
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
  byKey: Record<string, number>;
};

export async function geminiQuotaSnapshot(): Promise<QuotaSnapshot> {
  const [usage, byKey] = await Promise.all([geminiUsageToday(), geminiByKeyToday()]);
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
    byKey,
  };
}

/**
 * One generateContent call expecting a JSON body back. Walks the model chain; if
 * every model is rate-limited (429/404) — which happens because they share one
 * free-tier key — it backs off and retries the whole chain within a time budget
 * instead of failing instantly.
 */
export type GenerateOpts = { temperature?: number; model?: string; keyId?: string; freeOnly?: boolean };

export async function generateJson(prompt: string, tier: ModelTier = "quality", opts?: GenerateOpts): Promise<unknown> {
  const chain = geminiModels(tier);
  // A UI-picked model is tried first; the rest of the chain stays as fallback so a
  // throttled pick still completes instead of failing.
  const models = opts?.model ? dedupe([opts.model, ...chain]) : chain;
  const deadline = Date.now() + RATE_LIMIT_TOTAL_BUDGET_MS;
  let round = 0;
  let lastError: unknown;
  for (;;) {
    let allRateLimited = true;
    for (let i = 0; i < models.length; i++) {
      try {
        return await generateWithModel(models[i], prompt, i === models.length - 1, opts);
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

async function generateWithModel(model: string, prompt: string, _isLastModel: boolean, opts?: GenerateOpts): Promise<unknown> {
  // A UI-pinned key restricts this request to that one key; otherwise rotate all.
  let keys: string[];
  if (opts?.keyId) {
    const pinned = resolveKeyId(opts.keyId);
    if (!pinned) throw new GeminiError(`selected API key "${opts.keyId}" is no longer configured`, 400);
    if (opts.freeOnly && isBilledKey(pinned))
      throw new GeminiError(`freeOnly requested but the pinned key "${opts.keyId}" is billed`, 400);
    keys = [pinned];
  } else {
    keys = rotationKeys(opts?.freeOnly ?? false);
  }
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
              temperature: opts?.temperature ?? 0.7,
              // Pro is a thinking model — its reasoning eats the budget, so give the
              // answer real headroom on top of the flash default.
              maxOutputTokens: PRO_MODELS.has(model) ? Math.max(MAX_OUTPUT_TOKENS, 32_768) : MAX_OUTPUT_TOKENS,
              ...(THINKING_BUDGET !== undefined ? { thinkingConfig: { thinkingBudget: THINKING_BUDGET } } : {}),
            },
          }),
        });
        // Only a real 200 consumes a daily slot. 429 (quota gate) and 404 (free-tier
        // throttle — this API surfaces bursts as 404, not 429) consume nothing.
        if (res.ok) await recordGeminiRequest(model, keyLabelOf(key)).catch(() => {});
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
        const cleaned = stripFences(text);
        try {
          return JSON.parse(cleaned);
        } catch (parseErr) {
          // A response cut off at maxOutputTokens (or a stray unescaped quote) arrives
          // as unbalanced JSON. Try to close what the truncation left open rather than
          // throwing away the whole attempt (issues #29, #30).
          const repaired = repairJson(cleaned);
          if (repaired !== cleaned) {
            try {
              const value = JSON.parse(repaired);
              console.warn(
                `[gemini] recovered malformed JSON from ${model} (finishReason: ${
                  data.candidates?.[0]?.finishReason ?? "unknown"
                })`
              );
              return value;
            } catch {
              /* repair didn't help — fall through to the original error */
            }
          }
          throw parseErr;
        }
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
