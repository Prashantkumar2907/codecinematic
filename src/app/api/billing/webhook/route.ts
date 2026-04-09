import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || stripeKey.startsWith("YOUR_") || !webhookSecret || webhookSecret.startsWith("YOUR_")) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  try {
    const stripe = (await import("stripe")).default;
    const client = new stripe(stripeKey);
    const event = client.webhooks.constructEvent(body, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("[Stripe] Checkout completed:", session.metadata);
        // TODO: Update subscription in Supabase
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log(`[Stripe] Subscription ${event.type}:`, subscription.id);
        // TODO: Sync subscription status in Supabase
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }
}
