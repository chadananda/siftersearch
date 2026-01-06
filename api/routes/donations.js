/**
 * Donation Routes
 *
 * Stripe integration for one-time and recurring donations.
 *
 * POST /api/donations/create-checkout - Create a Stripe checkout session
 * POST /api/donations/webhook - Handle Stripe webhooks
 * GET /api/donations/history - Get user's donation history
 * POST /api/donations/portal - Create customer portal session
 */

import { userQuery as query, userQueryOne as queryOne, userQueryAll as queryAll } from '../lib/db.js';
import { ApiError } from '../lib/errors.js';
import { authenticate, optionalAuthenticate } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

// Donation tiers (monthly subscriptions only)
const DONATION_TIERS = [
  {
    id: 'supporter',
    name: 'Supporter',
    amounts: { monthly: 15 },
    description: 'Help keep SifterSearch running'
  },
  {
    id: 'patron',
    name: 'Patron',
    amounts: { monthly: 50 },
    description: 'Enhanced access and priority support',
    upgradeTier: 'patron'
  },
  {
    id: 'benefactor',
    name: 'Benefactor',
    amounts: { monthly: 200 },
    description: 'Major support for development and hosting',
    upgradeTier: 'patron'
  },
  {
    id: 'institutional',
    name: 'Institutional',
    amounts: { monthly: 500 },
    description: 'For libraries, universities, and organizations',
    upgradeTier: 'institutional'
  }
];

let stripe = null;
let stripePromise = null;

// Lazy init Stripe to avoid startup errors if key not configured
async function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    if (!stripePromise) {
      stripePromise = import('stripe').then(mod => {
        const Stripe = mod.default;
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia'
        });
        return stripe;
      });
    }
    return stripePromise;
  }
  return stripe;
}

export default async function donationRoutes(fastify) {
  // Get donation tiers
  fastify.get('/tiers', async () => {
    return { tiers: DONATION_TIERS };
  });

  // Create checkout session
  fastify.post('/create-checkout', {
    preHandler: optionalAuthenticate,
    schema: {
      body: {
        type: 'object',
        required: ['tierId', 'frequency'],
        properties: {
          tierId: { type: 'string' },
          frequency: { type: 'string', enum: ['monthly', 'yearly', 'once'] },
          customAmount: { type: 'number', minimum: 1 }
        }
      }
    }
  }, async (request) => {
    const stripeClient = await getStripe();
    if (!stripeClient) {
      throw ApiError.serverError('Stripe is not configured');
    }

    const { tierId, frequency, customAmount } = request.body;

    // Find tier or use custom amount
    let amount, tierName, mode;

    if (tierId === 'custom') {
      amount = customAmount;
      tierName = 'Custom Donation';
    } else {
      const tier = DONATION_TIERS.find(t => t.id === tierId);
      if (!tier) {
        throw ApiError.badRequest('Invalid donation tier');
      }
      amount = tier.amounts[frequency];
      tierName = tier.name;
    }

    // Determine mode and price data
    mode = frequency === 'once' ? 'payment' : 'subscription';

    const lineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `SifterSearch ${tierName}`,
          description: frequency === 'once'
            ? 'One-time donation'
            : `${frequency === 'monthly' ? 'Monthly' : 'Annual'} support`
        },
        unit_amount: amount * 100, // Stripe uses cents
        ...(frequency !== 'once' && {
          recurring: {
            interval: frequency === 'monthly' ? 'month' : 'year'
          }
        })
      },
      quantity: 1
    };

    // Create checkout session
    const sessionParams = {
      mode,
      line_items: [lineItem],
      success_url: `${process.env.CLIENT_URL || 'https://siftersearch.com'}/support/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'https://siftersearch.com'}/support`,
      metadata: {
        tierId,
        frequency,
        userId: request.user?.sub || 'anonymous'
      }
    };

    // Add customer email if authenticated
    if (request.user?.email) {
      sessionParams.customer_email = request.user.email;
    }

    const session = await stripeClient.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      url: session.url
    };
  });

  // Stripe webhook handler
  fastify.post('/webhook', {
    config: {
      rawBody: true
    }
  }, async (request, _reply) => {
    const stripeClient = await getStripe();
    if (!stripeClient) {
      throw ApiError.serverError('Stripe is not configured');
    }

    const sig = request.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw ApiError.serverError('Webhook secret not configured');
    }

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        request.rawBody,
        sig,
        webhookSecret
      );
    } catch (err) {
      logger.error({ err }, 'Webhook signature verification failed');
      throw ApiError.badRequest('Invalid signature');
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        await handleInvoicePaid(invoice);
        break;
      }

      default:
        logger.debug({ type: event.type }, 'Unhandled webhook event');
    }

    return { received: true };
  });

  // Get donation history (authenticated)
  fastify.get('/history', {
    preHandler: authenticate
  }, async (request) => {
    const donations = await queryAll(`
      SELECT id, amount, currency, frequency, tier_id, status, created_at
      FROM donations
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [request.user.sub]);

    return { donations };
  });

  // Create customer portal session
  fastify.post('/portal', {
    preHandler: authenticate
  }, async (request) => {
    const stripeClient = await getStripe();
    if (!stripeClient) {
      throw ApiError.serverError('Stripe is not configured');
    }

    // Get user's Stripe customer ID
    const user = await queryOne(
      'SELECT stripe_customer_id FROM users WHERE id = ?',
      [request.user.sub]
    );

    if (!user?.stripe_customer_id) {
      throw ApiError.badRequest('No active subscription found');
    }

    const session = await stripeClient.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.CLIENT_URL || 'https://siftersearch.com'}/support`
    });

    return { url: session.url };
  });
}

// Webhook handlers
async function handleCheckoutComplete(session) {
  const { tierId, frequency, userId } = session.metadata || {};

  // Record the donation
  await query(`
    INSERT INTO donations (
      user_id, stripe_session_id, stripe_customer_id, amount, currency,
      frequency, tier_id, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)
  `, [
    userId !== 'anonymous' ? userId : null,
    session.id,
    session.customer,
    session.amount_total / 100,
    session.currency,
    frequency,
    tierId,
    new Date().toISOString()
  ]);

  // Update user's Stripe customer ID if authenticated
  if (userId !== 'anonymous' && session.customer) {
    await query(
      'UPDATE users SET stripe_customer_id = ? WHERE id = ?',
      [session.customer, userId]
    );
  }

  // Upgrade user tier if applicable
  const tier = DONATION_TIERS.find(t => t.id === tierId);
  if (tier?.upgradeTier && userId !== 'anonymous' && frequency !== 'once') {
    await query(
      'UPDATE users SET tier = ? WHERE id = ?',
      [tier.upgradeTier, userId]
    );
    logger.info({ userId, tier: tier.upgradeTier }, 'User tier upgraded via donation');
  }

  logger.info({ sessionId: session.id, tierId, frequency }, 'Donation checkout completed');
}

async function handleSubscriptionUpdate(subscription) {
  // Update subscription status
  await query(`
    UPDATE donations SET status = ? WHERE stripe_subscription_id = ?
  `, [subscription.status, subscription.id]);

  logger.info({ subscriptionId: subscription.id, status: subscription.status }, 'Subscription updated');
}

async function handleSubscriptionCanceled(subscription) {
  // Mark subscription as canceled
  await query(`
    UPDATE donations SET status = 'canceled' WHERE stripe_subscription_id = ?
  `, [subscription.id]);

  // Downgrade user tier if needed
  const donation = await queryOne(
    'SELECT user_id, tier_id FROM donations WHERE stripe_subscription_id = ?',
    [subscription.id]
  );

  if (donation?.user_id) {
    const tier = DONATION_TIERS.find(t => t.id === donation.tier_id);
    if (tier?.upgradeTier) {
      // Check if user has other active subscriptions
      const activeCount = await queryOne(`
        SELECT COUNT(*) as count FROM donations
        WHERE user_id = ? AND status = 'active' AND frequency != 'once'
      `, [donation.user_id]);

      if (activeCount?.count === 0) {
        // Downgrade to approved
        await query(
          "UPDATE users SET tier = 'approved' WHERE id = ? AND tier = ?",
          [donation.user_id, tier.upgradeTier]
        );
        logger.info({ userId: donation.user_id }, 'User tier downgraded after subscription cancel');
      }
    }
  }

  logger.info({ subscriptionId: subscription.id }, 'Subscription canceled');
}

async function handleInvoicePaid(invoice) {
  if (invoice.subscription) {
    await query(`
      UPDATE donations
      SET status = 'active', updated_at = ?
      WHERE stripe_subscription_id = ?
    `, [new Date().toISOString(), invoice.subscription]);
  }

  logger.info({ invoiceId: invoice.id }, 'Invoice paid');
}
