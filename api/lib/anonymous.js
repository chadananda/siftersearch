/**
 * Anonymous User Utilities
 *
 * Shared functions for tracking anonymous users, checking query limits,
 * and managing user ID unification.
 *
 * Query Limit Tiers:
 * - Anonymous: 10 queries total
 * - Verified (logged in, email not verified, not approved): +10 queries (20 total)
 * - Approved, Patron, Institutional, Admin: Unlimited
 * - Banned: 0 queries
 */

import { query, queryOne } from './db.js';
import { logger } from './logger.js';

const ANONYMOUS_QUERY_LIMIT = 10;
const VERIFIED_QUERY_LIMIT = 20; // Total for logged-in but not approved users

/**
 * Extract anonymous user ID from request headers
 */
export function getAnonymousUserId(request) {
  const userId = request.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return null;
  }
  // Validate format: user_xxx or sess_xxx (for backwards compatibility)
  if (!userId.match(/^(user_|sess_)[a-f0-9-]+$/i)) {
    return null;
  }
  return userId;
}

/**
 * Ensure anonymous user exists in database, create if not.
 * Returns the user record.
 */
export async function ensureAnonymousUser(userId, request) {
  let user = await queryOne(
    'SELECT id, search_count FROM anonymous_users WHERE id = ?',
    [userId]
  );

  if (!user) {
    const userAgent = request.headers['user-agent'] || null;
    await query(
      `INSERT INTO anonymous_users (id, user_agent, first_seen_at, last_seen_at, search_count)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
      [userId, userAgent]
    );
    logger.info({ userId }, 'Created new anonymous user');
    user = { id: userId, search_count: 0 };
  }

  return user;
}

/**
 * Tiers that have unlimited queries
 */
const UNLIMITED_TIERS = ['approved', 'patron', 'institutional', 'admin'];

/**
 * Check if user has exceeded query limit.
 * Returns { allowed: boolean, remaining: number, limit: number, reason?: string }
 *
 * Tier limits:
 * - Anonymous: 10 queries
 * - Verified (logged in, not approved): 20 queries
 * - Approved/Patron/Institutional/Admin: Unlimited
 * - Banned: 0 queries
 */
export async function checkQueryLimit(request) {
  // Check authenticated user tier
  if (request.user) {
    const tier = request.user.tier || 'verified';
    const searchCount = request.user.search_count || 0;

    // Banned users get no queries
    if (tier === 'banned') {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        tier,
        isAuthenticated: true,
        reason: 'Your account has been suspended. Please contact support.'
      };
    }

    // Unlimited tiers
    if (UNLIMITED_TIERS.includes(tier)) {
      return { allowed: true, remaining: Infinity, limit: Infinity, tier, isAuthenticated: true };
    }

    // Verified users get 20 queries total (their own search count)
    const remaining = Math.max(0, VERIFIED_QUERY_LIMIT - searchCount);
    return {
      allowed: searchCount < VERIFIED_QUERY_LIMIT,
      remaining,
      limit: VERIFIED_QUERY_LIMIT,
      searchCount,
      tier,
      isAuthenticated: true,
      reason: remaining <= 0 ? 'You have used your 20 free searches. Please apply for approved access.' : undefined
    };
  }

  // Anonymous user
  const userId = getAnonymousUserId(request);
  if (!userId) {
    // No user ID - allow query but can't track
    return {
      allowed: true,
      remaining: ANONYMOUS_QUERY_LIMIT,
      limit: ANONYMOUS_QUERY_LIMIT,
      isAuthenticated: false
    };
  }

  const user = await ensureAnonymousUser(userId, request);
  const searchCount = user.search_count || 0;
  const remaining = Math.max(0, ANONYMOUS_QUERY_LIMIT - searchCount);

  return {
    allowed: searchCount < ANONYMOUS_QUERY_LIMIT,
    remaining,
    limit: ANONYMOUS_QUERY_LIMIT,
    searchCount,
    isAuthenticated: false,
    userId,
    reason: remaining <= 0 ? 'You have used your 10 free searches. Please sign up for more.' : undefined
  };
}

/**
 * Increment search count for anonymous user
 */
export async function incrementSearchCount(userId, searchQuery = null) {
  if (!userId) return;

  await query(
    `UPDATE anonymous_users
     SET search_count = search_count + 1,
         last_search_query = ?,
         last_seen_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [searchQuery, userId]
  );
}

/**
 * Increment search count for authenticated user
 */
export async function incrementUserSearchCount(userId) {
  if (!userId) return;

  await query(
    'UPDATE users SET search_count = search_count + 1 WHERE id = ?',
    [userId]
  );
}

/**
 * Unify anonymous user with authenticated user.
 * Merges search history, conversations, preferences, and profile data.
 * Called when a user logs in or signs up.
 *
 * This function:
 * 1. Transfers anonymous user's search count to authenticated user
 * 2. Transfers user profile data (learned preferences, interests)
 * 3. Updates anonymous_conversations to link to authenticated user
 * 4. Marks anonymous user as converted (keeps for audit trail)
 */
export async function unifyUserId(anonymousUserId, authenticatedUserId) {
  if (!anonymousUserId || !authenticatedUserId) {
    logger.warn({ anonymousUserId, authenticatedUserId }, 'Cannot unify: missing ID');
    return false;
  }

  try {
    // Get anonymous user data to transfer
    const anonUser = await queryOne(
      'SELECT search_count, preferences, interests FROM anonymous_users WHERE id = ?',
      [anonymousUserId]
    );

    if (anonUser) {
      // Add anonymous search count to authenticated user's count
      if (anonUser.search_count > 0) {
        await query(
          'UPDATE users SET search_count = search_count + ? WHERE id = ?',
          [anonUser.search_count, authenticatedUserId]
        );
        logger.info({ anonymousUserId, searchCount: anonUser.search_count }, 'Transferred search count');
      }
    }

    // Transfer user_profiles data (learned preferences, spiritual background, etc.)
    const anonProfile = await queryOne(
      'SELECT * FROM user_profiles WHERE user_id = ?',
      [anonymousUserId]
    );

    if (anonProfile) {
      // Check if authenticated user already has a profile
      const existingProfile = await queryOne(
        'SELECT id FROM user_profiles WHERE user_id = ?',
        [authenticatedUserId.toString()]
      );

      if (existingProfile) {
        // Merge profiles - anonymous data fills in gaps
        await query(
          `UPDATE user_profiles SET
             name = COALESCE(name, ?),
             bio = COALESCE(bio, ?),
             spiritual_background = COALESCE(spiritual_background, ?),
             interests = CASE WHEN interests IS NULL THEN ? ELSE interests END,
             preferred_sources = CASE WHEN preferred_sources IS NULL THEN ? ELSE preferred_sources END,
             metadata = CASE WHEN metadata IS NULL THEN ? ELSE metadata END,
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [
            anonProfile.name,
            anonProfile.bio,
            anonProfile.spiritual_background,
            anonProfile.interests,
            anonProfile.preferred_sources,
            anonProfile.metadata,
            authenticatedUserId.toString()
          ]
        );
      } else {
        // Transfer the entire profile to authenticated user
        await query(
          `UPDATE user_profiles SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
          [authenticatedUserId.toString(), anonymousUserId]
        );
      }
      logger.info({ anonymousUserId, authenticatedUserId }, 'Transferred user profile');
    }

    // Transfer anonymous_conversations to authenticated user
    // Keep the link but add user_id reference
    await query(
      `UPDATE anonymous_conversations
       SET user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE anonymous_user_id = ?`,
      [authenticatedUserId, anonymousUserId]
    );

    // Mark the anonymous user as converted (keep for audit trail)
    await query(
      `UPDATE anonymous_users
       SET converted_to_user_id = ?, converted_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [authenticatedUserId, anonymousUserId]
    );

    logger.info({ anonymousUserId, authenticatedUserId }, 'Unified anonymous user with authenticated account');
    return true;
  } catch (err) {
    logger.error({ err, anonymousUserId, authenticatedUserId }, 'Failed to unify user IDs');
    return false;
  }
}

export default {
  getAnonymousUserId,
  ensureAnonymousUser,
  checkQueryLimit,
  incrementSearchCount,
  incrementUserSearchCount,
  unifyUserId,
  ANONYMOUS_QUERY_LIMIT,
  VERIFIED_QUERY_LIMIT,
  UNLIMITED_TIERS
};
