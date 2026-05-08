import { cookies } from "next/headers";

import { DEMO_PREMIUM_EMAIL, DEMO_PREMIUM_PASSWORD } from "@/lib/demo-account";
import {
  SESSION_COOKIE,
  decodeSessionCookie,
  encodeSession,
  type AppSession,
} from "@/lib/session-cookie";

export { SESSION_COOKIE, encodeSession };
export type { AppSession };

/** Check if the given credentials match the built-in admin account. */
export function isAdminLogin(email: string, password: string): boolean {
  return email === DEMO_PREMIUM_EMAIL && password === DEMO_PREMIUM_PASSWORD;
}

/** Build an admin session object with full premium access. */
export function buildAdminSession(): AppSession {
  return {
    email: DEMO_PREMIUM_EMAIL,
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

  return decodeSessionCookie(raw);
}
