/**
 * Billing — API subscription and usage management
 *
 * # :arch: Metered billing for public API access via Stripe
 * # :why: Non-admin users must subscribe before creating API keys; usage is batch-reported to Stripe
 * # :deps: userQuery/userQueryOne/userQueryAll from db.js | lazy Stripe init pattern from donations.js
 * # :rules: Admin users (tier='admin') are never billed. Cached responses are not billed.
 * # :edge: reportUsageToStripe runs every 5min from worker; marks rows reported_to_stripe=1 to prevent double-billing
 */

import { userQuery, userQueryOne, userQueryAll } from './db.js';
import { logger } from './logger.js';

let stripe = null;
let stripePromise = null;

// Lazy init Stripe to avoid startup errors if key not configured
async function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY_LIVE) {
    if (!stripePromise) {
      stripePromise = import('stripe').then(mod => {
        const Stripe = mod.default;
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY_LIVE, {
          apiVersion: '2024-12-18.acacia'
        });
        return stripe;
      });
    }
    return stripePromise;
  }
  return stripe;
}

/**
 * Returns true if the user tier is subject to billing.
 * Admin users are never billed.
 */
export function isUserBillable(userTier) {
  return userTier !== 'admin';
}

/**
 * Get active subscription record for a user.
 */
export async function getSubscriptionStatus(userId) {
  return userQueryOne(
    `SELECT * FROM api_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
}

/**
 * Create a Stripe metered subscription for a user.
 * Associates the subscription with the user's stripe_customer_id.
 */
export async function createMeteredSubscription(userId, stripeCustomerId) {
  const stripeClient = await getStripe();
  if (!stripeClient) throw new Error('Stripe is not configured');

  const priceId = process.env.STRIPE_API_METERED_PRICE_ID;
  if (!priceId) throw new Error('STRIPE_API_METERED_PRICE_ID is not configured');

  const subscription = await stripeClient.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    metadata: { type: 'api_metered', userId: String(userId) }
  });

  const item = subscription.items.data[0];
  await userQuery(
    `INSERT INTO api_subscriptions (user_id, stripe_customer_id, stripe_subscription_id, stripe_subscription_item_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [userId, stripeCustomerId, subscription.id, item?.id || null, subscription.status]
  );

  return subscription;
}

/**
 * Record a single API usage event.
 * Skips recording for admin users or cached responses.
 */
export async function recordUsage(userId, apiKeyId, searchType, wasCached) {
  const user = await userQueryOne('SELECT tier FROM users WHERE id = ?', [userId]);
  if (!isUserBillable(user?.tier)) return;
  if (wasCached) return;
  await userQuery(
    `INSERT INTO api_usage_log (user_id, api_key_id, search_type, was_cached, billable, reported_to_stripe, created_at)
     VALUES (?, ?, ?, 0, 1, 0, CURRENT_TIMESTAMP)`,
    [userId, apiKeyId, searchType]
  );
}

/**
 * Batch-report unreported billable usage to Stripe.
 * Groups by subscription item and reports aggregate counts.
 * Marks rows as reported after successful submission.
 */
export async function reportUsageToStripe() {
  const stripeClient = await getStripe();
  if (!stripeClient) return;

  const unreported = await userQueryAll(
    `SELECT ul.user_id, COUNT(*) as count
     FROM api_usage_log ul
     WHERE ul.billable = 1 AND ul.reported_to_stripe = 0
     GROUP BY ul.user_id`
  );

  if (unreported.length === 0) return;

  let totalReported = 0;
  for (const row of unreported) {
    try {
      const sub = await userQueryOne(
        `SELECT stripe_subscription_item_id FROM api_subscriptions
         WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        [row.user_id]
      );
      if (!sub?.stripe_subscription_item_id) continue;

      await stripeClient.subscriptionItems.createUsageRecord(
        sub.stripe_subscription_item_id,
        { quantity: row.count, action: 'increment' }
      );

      await userQuery(
        `UPDATE api_usage_log SET reported_to_stripe = 1
         WHERE user_id = ? AND billable = 1 AND reported_to_stripe = 0`,
        [row.user_id]
      );

      totalReported += row.count;
      logger.debug({ userId: row.user_id, count: row.count }, 'Reported API usage to Stripe');
    } catch (err) {
      logger.error({ err: err.message, userId: row.user_id }, 'Failed to report usage to Stripe');
    }
  }

  if (totalReported > 0) {
    logger.info({ totalReported, userCount: unreported.length }, 'API usage batch reported to Stripe');
  }
}
