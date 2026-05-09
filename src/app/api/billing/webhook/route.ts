import { apiError, apiSuccess } from "@/lib/api-response";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return apiError("bad_request", "Missing signature", 400);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || stripeKey.startsWith("YOUR_") || !webhookSecret || webhookSecret.startsWith("YOUR_")) {
    return apiError("not_configured", "Stripe not configured", 503);
  }

  try {
    const stripe = (await import("stripe")).default;
    const client = new stripe(stripeKey);
    const event = client.webhooks.constructEvent(body, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.info("[Stripe] Checkout completed", {
          id: session.id,
          hasPlanMetadata: Boolean(session.metadata?.plan),
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.info("[Stripe] Subscription event", {
          id: subscription.id,
          type: event.type,
          status: subscription.status,
        });
        break;
      }
      default:
        break;
    }

    return apiSuccess({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return apiError("bad_request", "Webhook verification failed", 400);
  }
}
