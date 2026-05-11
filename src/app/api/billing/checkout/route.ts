import { NextResponse } from "next/server";

import { getSession, type AppSession } from "@/lib/auth";
import type { PlanCode } from "@/lib/plans";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

const paidPlanCodes = ["basic", "medium", "high"] as const satisfies readonly PlanCode[];
type PaidPlanCode = (typeof paidPlanCodes)[number];

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/pricing", request.url));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login?next=%2Fpricing", request.url));
  }

  const formData = await request.formData().catch(() => null);
  const planCode = formData?.get("plan");

  if (typeof planCode !== "string" || !isPaidPlanCode(planCode)) {
    return NextResponse.redirect(new URL("/pricing?error=invalid-plan", request.url));
  }

  return createCheckoutRedirect(request, session, planCode);
}

async function createCheckoutRedirect(request: Request, session: AppSession, planCode: PaidPlanCode) {
  const requestOrigin = new URL(request.url).origin;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.startsWith("YOUR_")) {
    return NextResponse.redirect(new URL("/pricing?error=stripe-not-configured", request.url));
  }

  try {
    const stripe = (await import("stripe")).default;
    const client = new stripe(stripeKey);

    const priceMapping: Record<PaidPlanCode, string> = {
      basic: process.env.STRIPE_PRICE_BASIC ?? "",
      medium: process.env.STRIPE_PRICE_MEDIUM ?? "",
      high: process.env.STRIPE_PRICE_HIGH ?? "",
    };

    const priceId = priceMapping[planCode];
    if (!priceId) {
      return NextResponse.redirect(new URL("/pricing?error=price-not-configured", request.url));
    }

    const appUrl = getAppUrl(requestOrigin);
    const context = await getSupabaseUserContext();
    const metadata = {
      plan: planCode,
      email: session.email,
      ...(context?.user.id ? { userId: context.user.id } : {}),
    };
    const checkoutSession = await client.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: session.email,
      client_reference_id: context?.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      metadata,
      subscription_data: { metadata },
    });

    return NextResponse.redirect(checkoutSession.url ?? `${appUrl}/pricing`);
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.redirect(new URL("/pricing?error=checkout-failed", request.url));
  }
}

function isPaidPlanCode(value: string | null): value is PaidPlanCode {
  return paidPlanCodes.some((code) => code === value);
}

function getAppUrl(fallbackOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured || configured.startsWith("YOUR_")) {
    return fallbackOrigin;
  }

  try {
    return new URL(configured).origin;
  } catch {
    return fallbackOrigin;
  }
}
