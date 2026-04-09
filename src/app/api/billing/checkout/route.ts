import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { PLAN_CONFIG, type PlanCode } from "@/lib/plans";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const planCode = url.searchParams.get("plan") as PlanCode | null;

  if (!planCode || !PLAN_CONFIG[planCode] || planCode === "free") {
    return NextResponse.redirect(new URL("/pricing?error=invalid-plan", request.url));
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey.startsWith("YOUR_")) {
    return NextResponse.redirect(new URL("/pricing?error=stripe-not-configured", request.url));
  }

  try {
    const stripe = (await import("stripe")).default;
    const client = new stripe(stripeKey);

    const priceMapping: Record<string, string> = {
      basic: process.env.STRIPE_PRICE_BASIC ?? "",
      medium: process.env.STRIPE_PRICE_MEDIUM ?? "",
      high: process.env.STRIPE_PRICE_HIGH ?? "",
    };

    const priceId = priceMapping[planCode];
    if (!priceId) {
      return NextResponse.redirect(new URL("/pricing?error=price-not-configured", request.url));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const checkoutSession = await client.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: session.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { plan: planCode, email: session.email },
    });

    return NextResponse.redirect(checkoutSession.url ?? `${appUrl}/pricing`);
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.redirect(new URL("/pricing?error=checkout-failed", request.url));
  }
}
