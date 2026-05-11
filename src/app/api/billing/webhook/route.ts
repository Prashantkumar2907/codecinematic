import type Stripe from "stripe";

import { apiError, apiSuccess } from "@/lib/api-response";
import type { PlanCode } from "@/lib/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paidPlanCodes = ["basic", "medium", "high"] as const satisfies readonly PlanCode[];
type PaidPlanCode = (typeof paidPlanCodes)[number];

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
        await syncCheckoutSession(client, session);
        console.info("[Stripe] Checkout completed", {
          id: session.id,
          hasPlanMetadata: Boolean(session.metadata?.plan),
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await syncSubscription(subscription);
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

async function syncCheckoutSession(
  stripeClient: Stripe,
  checkoutSession: Stripe.Checkout.Session,
) {
  const planCode = readPaidPlanCode(checkoutSession.metadata?.plan);
  const userId = readUuid(checkoutSession.metadata?.userId ?? checkoutSession.client_reference_id);
  const subscriptionId =
    typeof checkoutSession.subscription === "string"
      ? checkoutSession.subscription
      : checkoutSession.subscription?.id;

  if (!planCode || !userId || !subscriptionId) {
    return;
  }

  const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
  await upsertSubscription({
    userId,
    planCode,
    providerCustomerId:
      typeof checkoutSession.customer === "string"
        ? checkoutSession.customer
        : checkoutSession.customer?.id,
    providerSubscriptionId: subscriptionId,
    status: subscription.status,
    currentPeriodStart: readStripeTimestamp(subscription, "current_period_start"),
    currentPeriodEnd: readStripeTimestamp(subscription, "current_period_end"),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const planCode = readPaidPlanCode(subscription.metadata?.plan) ?? readPaidPlanCodeFromPriceEnv(subscription);
  const userId = readUuid(subscription.metadata?.userId);

  await upsertSubscription({
    userId,
    planCode,
    providerCustomerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id,
    providerSubscriptionId: subscription.id,
    status: subscription.status ?? "active",
    currentPeriodStart: readStripeTimestamp(subscription, "current_period_start"),
    currentPeriodEnd: readStripeTimestamp(subscription, "current_period_end"),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
  });
}

async function upsertSubscription({
  userId,
  planCode,
  providerCustomerId,
  providerSubscriptionId,
  status,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: {
  userId?: string | null;
  planCode?: PaidPlanCode | null;
  providerCustomerId?: string | null;
  providerSubscriptionId: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !userId || !planCode) {
    return;
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id")
    .eq("code", planCode)
    .maybeSingle();

  if (planError || !plan?.id) {
    throw new Error("Could not resolve subscription plan.");
  }

  const row = {
    user_id: userId,
    plan_id: plan.id,
    provider: "stripe",
    provider_customer_id: providerCustomerId ?? null,
    provider_subscription_id: providerSubscriptionId,
    status,
    current_period_start: currentPeriodStart ?? null,
    current_period_end: currentPeriodEnd ?? null,
    cancel_at_period_end: cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (existingError) {
    throw new Error("Could not look up existing subscription.");
  }

  const result = existing?.id
    ? await supabase.from("subscriptions").update(row).eq("id", existing.id)
    : await supabase.from("subscriptions").insert(row);

  if (result.error) {
    throw new Error("Could not sync subscription.");
  }
}

function readPaidPlanCode(value: unknown): PaidPlanCode | null {
  return typeof value === "string" && paidPlanCodes.some((code) => code === value)
    ? value as PaidPlanCode
    : null;
}

function readPaidPlanCodeFromPriceEnv(subscription: unknown): PaidPlanCode | null {
  const priceId = readSubscriptionPriceId(subscription);
  if (!priceId) return null;

  const envMap: Record<PaidPlanCode, string | undefined> = {
    basic: process.env.STRIPE_PRICE_BASIC,
    medium: process.env.STRIPE_PRICE_MEDIUM,
    high: process.env.STRIPE_PRICE_HIGH,
  };

  return paidPlanCodes.find((planCode) => envMap[planCode] === priceId) ?? null;
}

function readSubscriptionPriceId(subscription: unknown): string | null {
  if (!isRecord(subscription)) return null;
  const items = subscription.items;
  if (!isRecord(items) || !Array.isArray(items.data)) return null;
  const firstItem = items.data[0];
  if (!isRecord(firstItem) || !isRecord(firstItem.price)) return null;
  return typeof firstItem.price.id === "string" ? firstItem.price.id : null;
}

function readStripeTimestamp(subscription: unknown, key: "current_period_start" | "current_period_end") {
  if (!isRecord(subscription) || typeof subscription[key] !== "number") {
    return null;
  }

  return new Date(subscription[key] * 1000).toISOString();
}

function readUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
