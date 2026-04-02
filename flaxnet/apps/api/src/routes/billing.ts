import { Router } from 'express';
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { logger } from '../lib/logger.js';
import { fail, ok } from '../lib/response.js';
import { getStripe, stripeConfigured } from '../lib/stripe.js';
import { isPlan, planFromStripeSubscription, planToPriceId } from '../lib/stripeBilling.js';
import {
  countActiveLeads,
  countOutboundSmsThisUtcMonth,
  limitsForPlan,
} from '../lib/usageLimits.js';
import { validateBody } from '../middleware/validate.js';

const checkoutBody = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'SCALE']),
});

export const billingRouter = Router();

billingRouter.get(
  '/summary',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const limits = limitsForPlan(ws.plan);
    const [leads, smsThisMonth] = await Promise.all([
      countActiveLeads(workspaceId),
      countOutboundSmsThisUtcMonth(workspaceId),
    ]);
    res.json(
      ok({
        plan: ws.plan,
        limits: {
          maxLeads: Number.isFinite(limits.maxLeads) ? limits.maxLeads : null,
          maxSmsPerMonth: Number.isFinite(limits.maxSmsPerMonth) ? limits.maxSmsPerMonth : null,
        },
        usage: { leads, smsThisMonth },
        stripeEnabled: stripeConfigured(),
      })
    );
  })
);

billingRouter.post(
  '/create-checkout-session',
  validateBody(checkoutBody),
  asyncRoute(async (req, res) => {
    if (!stripeConfigured()) {
      res.status(503).json(fail('Stripe is not configured'));
      return;
    }
    const { plan } = req.body as z.infer<typeof checkoutBody>;
    const workspaceId = req.workspaceId!;
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const priceId = planToPriceId(plan);
    if (!priceId) {
      res.status(503).json(fail(`Missing Stripe price env for plan ${plan}`));
      return;
    }
    const stripe = getStripe();
    try {
      let customerId = ws.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          metadata: { workspaceId },
        });
        customerId = customer.id;
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { stripeCustomerId: customerId },
        });
      }
      const origin = process.env.APP_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
      const base = origin.replace(/\/$/, '');
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/settings/billing?checkout=cancel`,
        metadata: { workspaceId, plan },
        subscription_data: {
          metadata: { workspaceId, plan },
        },
      });
      if (!session.url) {
        res.status(500).json(fail('Checkout session missing URL'));
        return;
      }
      res.json(ok({ url: session.url }));
      return;
    } catch (e) {
      logger.error('stripe.checkout_session_failed', {
        workspaceId,
        err: e instanceof Error ? e.message : String(e),
      });
      res.status(502).json(fail('Billing provider error — try again shortly'));
    }
  })
);

async function syncWorkspaceFromSubscription(_stripe: Stripe, sub: Stripe.Subscription): Promise<void> {
  const plan = planFromStripeSubscription(sub);
  const wid = sub.metadata?.workspaceId;
  if (wid) {
    await prisma.workspace.update({
      where: { id: wid },
      data: {
        stripeSubscriptionId: sub.id,
        ...(plan ? { plan } : {}),
      },
    });
    return;
  }
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const ws = await prisma.workspace.findFirst({ where: { stripeCustomerId: customerId } });
  if (ws && plan) {
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { stripeSubscriptionId: sub.id, plan },
    });
  }
}

/** Raw body only — mount before `express.json()`. */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!whSecret || typeof sig !== 'string') {
    res.status(400).send('Webhook not configured');
    return;
  }
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    res.status(503).send('Stripe not configured');
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, whSecret);
  } catch (err) {
    console.error('[stripe webhook] signature', err);
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const wid = session.metadata?.workspaceId;
        const subRef = session.subscription;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id;
        const cust = session.customer;
        const customerId = typeof cust === 'string' ? cust : cust?.id;
        if (wid && subId && customerId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const plan =
            planFromStripeSubscription(sub) ??
            (session.metadata?.plan && isPlan(session.metadata.plan) ? session.metadata.plan : null);
          await prisma.workspace.update({
            where: { id: wid },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subId,
              ...(plan ? { plan } : {}),
            },
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await syncWorkspaceFromSubscription(stripe, sub);
        break;
      }
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice;
        const subRef = inv.subscription;
        const subId = typeof subRef === 'string' ? subRef : subRef?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncWorkspaceFromSubscription(stripe, sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('[stripe webhook] handler', e);
    res.status(500).json({ error: 'Webhook handler failed' });
    return;
  }

  res.json({ received: true });
}
