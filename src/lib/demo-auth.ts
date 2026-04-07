import { cookies } from "next/headers";

import type { PlanCode } from "@/lib/plans";

export const DEMO_SESSION_COOKIE = "codecinematic_demo_session";

export type DemoAccount = {
  email: string;
  password: string;
  plan: PlanCode;
  name: string;
};

export function getDemoAccounts(): DemoAccount[] {
  return [
    {
      email: process.env.DEMO_FREE_EMAIL ?? "free@codecinematic.demo",
      password: process.env.DEMO_FREE_PASSWORD ?? "FreePlan123!",
      plan: "free",
      name: "Free Demo"
    },
    {
      email: process.env.DEMO_BASIC_EMAIL ?? "basic@codecinematic.demo",
      password: process.env.DEMO_BASIC_PASSWORD ?? "BasicPlan123!",
      plan: "basic",
      name: "Basic Demo"
    },
    {
      email: process.env.DEMO_MEDIUM_EMAIL ?? "medium@codecinematic.demo",
      password: process.env.DEMO_MEDIUM_PASSWORD ?? "MediumPlan123!",
      plan: "medium",
      name: "Medium Demo"
    },
    {
      email: process.env.DEMO_HIGH_EMAIL ?? "high@codecinematic.demo",
      password: process.env.DEMO_HIGH_PASSWORD ?? "HighPlan123!",
      plan: "high",
      name: "High Demo"
    }
  ];
}

export function validateDemoLogin(email: string, password: string) {
  return getDemoAccounts().find((account) => account.email === email && account.password === password) ?? null;
}

export async function getDemoSession() {
  const store = await cookies();
  const raw = store.get(DEMO_SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      email: string;
      plan: PlanCode;
      name: string;
    };

    return decoded;
  } catch {
    return null;
  }
}

export function encodeDemoSession(account: DemoAccount) {
  return Buffer.from(
    JSON.stringify({
      email: account.email,
      plan: account.plan,
      name: account.name
    }),
    "utf8"
  ).toString("base64url");
}
