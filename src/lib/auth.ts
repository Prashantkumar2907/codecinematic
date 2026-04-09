import { cookies } from "next/headers";

import type { PlanCode } from "@/lib/plans";

export const SESSION_COOKIE = "codecinematic_session";

export type AppSession = {
  email: string;
  plan: PlanCode;
  name: string;
  isAdmin: boolean;
};

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin123";

/** Check if the given credentials match the built-in admin account. */
export function isAdminLogin(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

/** Build an admin session object with full premium access. */
export function buildAdminSession(): AppSession {
  return {
    email: ADMIN_EMAIL,
    plan: "high",
    name: "Admin",
    isAdmin: true,
  };
}

/** Read the current session from cookies. Returns null if not authenticated. */
export async function getSession(): Promise<AppSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as AppSession;
    return decoded;
  } catch {
    return null;
  }
}

/** Encode a session object into a cookie-safe string. */
export function encodeSession(session: AppSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}
