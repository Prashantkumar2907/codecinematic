import type { PlanCode } from "@/lib/plans";

export const SESSION_COOKIE = "codecinematic_session";

export type AppSession = {
  email: string;
  plan: PlanCode;
  name: string;
  isAdmin: boolean;
};

const REDIRECT_BASE = "http://codecinematic.local";

export function encodeSession(session: AppSession): string {
  return encodeBase64Url(JSON.stringify(session));
}

export function decodeSessionCookie(raw: string): AppSession | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as Partial<AppSession>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.plan !== "string" ||
      typeof parsed.isAdmin !== "boolean"
    ) {
      return null;
    }

    if (!["free", "basic", "medium", "high"].includes(parsed.plan)) {
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
