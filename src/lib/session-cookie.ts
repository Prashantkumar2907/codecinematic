import type { PlanCode } from "@/lib/plans";

export const SESSION_COOKIE = "codecinematic_session";
const SESSION_VERSION = "v1";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEV_SESSION_SECRET = "codecinematic-development-session-secret-change-before-production";

export type AppSession = {
  email: string;
  plan: PlanCode;
  name: string;
  isAdmin: boolean;
};

type SignedSessionPayload = AppSession & {
  iat: number;
  exp: number;
};

const REDIRECT_BASE = "http://codecinematic.local";

export async function encodeSession(session: AppSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeBase64Url(JSON.stringify({
    ...session,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  } satisfies SignedSessionPayload));
  const signature = await signSessionPayload(payload);

  if (!signature) {
    throw new Error("SESSION_SECRET is required to issue signed sessions in production.");
  }

  return `${SESSION_VERSION}.${payload}.${signature}`;
}

export async function decodeSessionCookie(raw: string): Promise<AppSession | null> {
  try {
    const [version, payload, signature] = raw.split(".");
    if (version !== SESSION_VERSION || !payload || !signature) {
      return null;
    }

    const expectedSignature = await signSessionPayload(payload);
    if (!expectedSignature || !timingSafeStringEqual(signature, expectedSignature)) {
      return null;
    }

    const parsed = JSON.parse(decodeBase64Url(payload)) as Partial<SignedSessionPayload>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.plan !== "string" ||
      typeof parsed.isAdmin !== "boolean" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    if (!["free", "basic", "medium", "high"].includes(parsed.plan)) {
      return null;
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      email: parsed.email,
      plan: parsed.plan as PlanCode,
      name: parsed.name,
      isAdmin: parsed.isAdmin,
    };
  } catch {
    return null;
  }
}

export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  const candidate = value?.trim();
  if (!candidate || candidate.includes("\\") || /[\u0000-\u001f]/.test(candidate)) {
    return fallback;
  }

  try {
    const url = new URL(candidate, REDIRECT_BASE);
    if (url.origin !== REDIRECT_BASE || !url.pathname.startsWith("/")) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret && !secret.startsWith("YOUR_") && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return DEV_SESSION_SECRET;
}

async function signSessionPayload(payload: string): Promise<string | null> {
  const secret = getSessionSecret();
  if (!secret) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeBytesBase64Url(new Uint8Array(signature));
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

function encodeBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function encodeBytesBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
