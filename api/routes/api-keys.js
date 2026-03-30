/**
 * API Key Routes
 *
 * User-facing routes for managing API keys and subscriptions.
 * All routes require authentication.
 *
 * # :arch: Routes are prefixed /api/api-keys in server.js
 * # :why: Separates API key management from public search API
 * # :deps: billing.js for subscription checks | api-keys.js lib for key CRUD | auth.js for authenticate
 * # :rules: Admin users can create keys freely. Non-admin requires active api_subscriptions row.
 *
 * GET    /api/api-keys/           - List user's keys
 * POST   /api/api-keys/           - Create key (requires subscription or admin)
 * DELETE /api/api-keys/:id        - Revoke key
 * GET    /api/api-keys/usage      - Usage aggregate from api_usage_log
 * GET    /api/api-keys/subscription - Subscription status
 * POST   /api/api-keys/subscribe  - Create Stripe checkout for metered subscription
 * POST   /api/api-keys/portal     - Create Stripe billing portal session
 */

import { createApiKey, listApiKeys, revokeApiKey } from '../lib/api-keys.js';
import { getSubscriptionStatus, isUserBillable } from '../lib/billing.js';
import { userQueryOne, userQueryAll } from '../lib/db.js';
import { authenticate } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

let stripe = null;
let stripePromise = null;

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

export default async function apiKeyRoutes(fastify) {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET / — list user's API keys
  fastify.get('/', async (request) => {
    const keys = await listApiKeys(request.user.sub);
    return { keys };
  });

  // POST / — create a new API key
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    }
  }, async (request) => {
    const user = await userQueryOne('SELECT tier FROM users WHERE id = ?', [request.user.sub]);
    if (isUserBillable(user?.tier)) {
      const sub = await getSubscriptionStatus(request.user.sub);
      if (!sub || sub.status !== 'active') {
        throw new ApiError('Active API subscription required. Subscribe at /api/api-keys/subscribe.', 402);
      }
    }
    const result = await createApiKey(request.user.sub, request.body.name);
    logger.info({ userId: request.user.sub, keyName: request.body.name }, 'API key created');
    return { key: result.key, id: result.id, name: result.name, keyPrefix: result.keyPrefix };
  });

  // DELETE /:id — revoke a key
  fastify.delete('/:id', async (request) => {
    const { id } = request.params;
    await revokeApiKey(id, request.user.sub);
    logger.info({ userId: request.user.sub, keyId: id }, 'API key revoked');
    return { revoked: true };
  });

  // GET /usage — aggregate usage from api_usage_log
  fastify.get('/usage', async (request) => {
    const rows = await userQueryAll(
      `SELECT search_type, COUNT(*) as count,
              SUM(CASE WHEN reported_to_stripe = 1 THEN 1 ELSE 0 END) as reported,
              SUM(CASE WHEN billable = 1 THEN 1 ELSE 0 END) as billable
       FROM api_usage_log WHERE user_id = ?
       GROUP BY search_type`,
      [request.user.sub]
    );
    const total = await userQueryOne(
      'SELECT COUNT(*) as count FROM api_usage_log WHERE user_id = ?',
      [request.user.sub]
    );
    return { usage: rows, totalRequests: total?.count || 0 };
  });

  // GET /subscription — subscription status
  fastify.get('/subscription', async (request) => {
    const sub = await getSubscriptionStatus(request.user.sub);
    return { subscription: sub || null };
  });

  // POST /subscribe — create Stripe checkout for metered subscription
  fastify.post('/subscribe', async (request) => {
    const stripeClient = await getStripe();
    if (!stripeClient) throw ApiError.serverError('Stripe is not configured');

    const priceId = process.env.STRIPE_API_METERED_PRICE_ID;
    if (!priceId) throw ApiError.serverError('STRIPE_API_METERED_PRICE_ID is not configured');

    const user = await userQueryOne(
      'SELECT email, stripe_customer_id FROM users WHERE id = ?',
      [request.user.sub]
    );

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId }],
      success_url: `${process.env.CLIENT_URL || 'https://siftersearch.com'}/settings?api_subscribed=1`,
      cancel_url: `${process.env.CLIENT_URL || 'https://siftersearch.com'}/settings`,
      metadata: { type: 'api_metered', userId: String(request.user.sub) }
    };

    if (user?.stripe_customer_id) sessionParams.customer = user.stripe_customer_id;
    else if (user?.email) sessionParams.customer_email = user.email;

    const session = await stripeClient.checkout.sessions.create(sessionParams);
    return { sessionId: session.id, url: session.url };
  });

  // POST /portal — create Stripe billing portal session
  fastify.post('/portal', async (request) => {
    const stripeClient = await getStripe();
    if (!stripeClient) throw ApiError.serverError('Stripe is not configured');

    const user = await userQueryOne(
      'SELECT stripe_customer_id FROM users WHERE id = ?',
      [request.user.sub]
    );

    if (!user?.stripe_customer_id) throw ApiError.badRequest('No billing account found');

    const session = await stripeClient.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.CLIENT_URL || 'https://siftersearch.com'}/settings`
    });

    return { url: session.url };
  });
}
