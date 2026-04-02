import type { Plan } from '@prisma/client';
import type Stripe from 'stripe';

const planValues: Plan[] = ['STARTER', 'GROWTH', 'SCALE'];

export function isPlan(s: string): s is Plan {
  return planValues.includes(s as Plan);
}

export function planToPriceId(plan: Plan): string | undefined {
  const map: Record<Plan, string | undefined> = {
    STARTER: process.env.STRIPE_PRICE_STARTER?.trim(),
    GROWTH: process.env.STRIPE_PRICE_GROWTH?.trim(),
    SCALE: process.env.STRIPE_PRICE_SCALE?.trim(),
  };
  return map[plan];
}

export function priceIdToPlan(priceId: string): Plan | null {
  const id = priceId.trim();
  if (process.env.STRIPE_PRICE_STARTER?.trim() === id) return 'STARTER';
  if (process.env.STRIPE_PRICE_GROWTH?.trim() === id) return 'GROWTH';
  if (process.env.STRIPE_PRICE_SCALE?.trim() === id) return 'SCALE';
  return null;
}

/** Best-effort plan from a Stripe subscription object */
export function planFromStripeSubscription(sub: Stripe.Subscription): Plan | null {
  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  if (!priceId) return null;
  return priceIdToPlan(priceId);
}
