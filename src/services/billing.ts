import Stripe from 'stripe';
import type { AppConfig } from '../types/index.js';
import type { Plan } from '../types/index.js';
import {
  findUserById,
  findUserByStripeCustomerId,
  setStripeCustomerId,
  updateUserPlan,
} from './users.js';

/** Stripe billing service dependencies. */
export interface BillingDeps {
  config: AppConfig;
  stripe?: Stripe;
}

/**
 * Creates or returns a Stripe client instance.
 * @param config - Application configuration
 * @returns Stripe SDK client
 */
function getStripeClient(config: AppConfig): Stripe {
  return new Stripe(config.stripeSecretKey);
}

/**
 * Resolves a plan name from a Stripe price ID.
 * @param config - Application configuration
 * @param priceId - Stripe price ID
 * @returns Plan name or null
 */
function planFromPriceId(config: AppConfig, priceId: string): Plan | null {
  if (priceId === config.stripePricePro) {
    return 'pro';
  }
  if (priceId === config.stripePriceMax) {
    return 'max';
  }
  return null;
}

/**
 * Ensures a Stripe customer exists for the user.
 * @param deps - Billing dependencies
 * @param userId - User ID
 * @returns Stripe customer ID
 */
async function ensureStripeCustomer(deps: BillingDeps, userId: string): Promise<string> {
  const user = findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = deps.stripe ?? getStripeClient(deps.config);
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });

  setStripeCustomerId(userId, customer.id);
  return customer.id;
}

/**
 * Creates a Stripe Checkout session for plan upgrade.
 * @param deps - Billing dependencies
 * @param userId - User ID
 * @param plan - Target plan
 * @param successUrl - Redirect URL on success
 * @param cancelUrl - Redirect URL on cancel
 * @returns Checkout session URL
 */
export async function createCheckoutSession(
  deps: BillingDeps,
  userId: string,
  plan: 'pro' | 'max',
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const stripe = deps.stripe ?? getStripeClient(deps.config);
  const customerId = await ensureStripeCustomer(deps, userId);
  const priceId = plan === 'pro' ? deps.config.stripePricePro : deps.config.stripePriceMax;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, plan },
  });

  if (!session.url) {
    throw new Error('Stripe checkout session URL missing');
  }

  return session.url;
}

/**
 * Creates a Stripe Billing Portal session.
 * @param deps - Billing dependencies
 * @param userId - User ID
 * @param returnUrl - Return URL after portal
 * @returns Billing portal URL
 */
export async function createBillingPortalSession(
  deps: BillingDeps,
  userId: string,
  returnUrl: string,
): Promise<string> {
  const stripe = deps.stripe ?? getStripeClient(deps.config);
  const customerId = await ensureStripeCustomer(deps, userId);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Processes a verified Stripe webhook event.
 * @param deps - Billing dependencies
 * @param payload - Raw webhook body
 * @param signature - Stripe signature header
 * @param logger - Logger with info/warn methods
 */
export async function handleWebhook(
  deps: BillingDeps,
  payload: Buffer,
  signature: string,
  logger: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void },
): Promise<void> {
  const stripe = deps.stripe ?? getStripeClient(deps.config);
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    deps.config.stripeWebhookSecret,
  );

  logger.info(
    {
      event_type: event.type,
      customer_id: (event.data.object as { customer?: string }).customer ?? null,
      subscription_id: (event.data.object as { id?: string }).id ?? null,
    },
    'stripe webhook received',
  );

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan as Plan | undefined;
      if (userId && plan) {
        updateUserPlan(userId, plan);
      } else if (session.customer) {
        const user = findUserByStripeCustomerId(String(session.customer));
        if (user && session.line_items) {
          // plan resolved via subscription events if metadata missing
        }
      }
      break;
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = String(subscription.customer);
      const user = findUserByStripeCustomerId(customerId);
      if (!user) {
        break;
      }
      const priceId = subscription.items.data[0]?.price.id;
      if (!priceId) {
        break;
      }
      const plan = planFromPriceId(deps.config, priceId);
      if (plan && subscription.status === 'active') {
        updateUserPlan(user.id, plan);
      }
      if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
        updateUserPlan(user.id, 'free');
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const user = findUserByStripeCustomerId(String(subscription.customer));
      if (user) {
        updateUserPlan(user.id, 'free');
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      logger.warn(
        { customer_id: invoice.customer, invoice_id: invoice.id },
        'stripe payment failed',
      );
      break;
    }
    default:
      break;
  }
}
