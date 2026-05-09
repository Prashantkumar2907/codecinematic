import { headers } from "next/headers";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { SESSION_COOKIE, buildAdminSession, encodeSession, isAdminLogin } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

const MAX_FAILED_ATTEMPTS = 6;
const FAILED_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

declare global {
  var __codecinematicLoginAttempts: Map<string, LoginAttempt> | undefined;
}

const loginAttempts =
  globalThis.__codecinematicLoginAttempts ??
  (globalThis.__codecinematicLoginAttempts = new Map<string, LoginAttempt>());

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return apiError("invalid_payload", "Enter a valid email and password.", 400, parsed.error.flatten());
  }

  const { email, password } = parsed.data;
  const attemptKey = await getLoginAttemptKey(email);

  if (isRateLimited(attemptKey)) {
    return apiError(
      "rate_limited",
      "Too many sign-in attempts. Please wait a few minutes and try again.",
      429,
    );
  }

  if (isAdminLogin(email, password)) {
    try {
      const response = apiSuccess({});
      response.cookies.set(
        SESSION_COOKIE,
        await encodeSession(buildAdminSession()),
        SESSION_COOKIE_OPTIONS,
      );
      clearFailedAttempts(attemptKey);
      return response;
    } catch {
      return apiError("not_configured", "Session signing is not configured.", 500);
    }
  }

  if (!hasSupabaseEnv()) {
    recordFailedAttempt(attemptKey);
    return apiError("not_configured", "Supabase is not configured.", 400);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      recordFailedAttempt(attemptKey);
      return apiError("unauthorized", "Invalid email or password.", 401);
    }

    const response = apiSuccess({});
    response.cookies.set(
      SESSION_COOKIE,
      await encodeSession({
        email: data.user.email ?? email,
        plan: "free",
        name: data.user.user_metadata?.full_name ?? email.split("@")[0],
        isAdmin: false,
      }),
      SESSION_COOKIE_OPTIONS,
    );
    clearFailedAttempts(attemptKey);
    return response;
  } catch {
    return apiError("upstream_error", "Unexpected error", 500);
  }
}

async function getLoginAttemptKey(email: string): Promise<string> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || headerStore.get("x-real-ip") || "unknown";
  return `${ip}:${email}`;
}

function isRateLimited(key: string): boolean {
  const attempt = loginAttempts.get(key);
  if (!attempt) return false;

  const now = Date.now();
  if (attempt.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }

  return attempt.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + FAILED_ATTEMPT_WINDOW_MS });
    return;
  }

  loginAttempts.set(key, { ...current, count: current.count + 1 });
}

function clearFailedAttempts(key: string) {
  loginAttempts.delete(key);
}
