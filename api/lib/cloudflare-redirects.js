/**
 * Cloudflare Bulk Redirects Integration
 *
 * Syncs URL redirects to Cloudflare edge for instant 301 responses
 * without hitting origin. Disabled during alpha.
 *
 * Architecture:
 * - Redirects stored in SQLite (source of truth)
 * - Pushed to Cloudflare Bulk Redirects for edge caching
 * - Fallback: API handles redirects not yet synced to CF
 *
 * Enable with: CLOUDFLARE_REDIRECTS_ENABLED=true
 */

import { config } from './config.js';
import { queryAll, query } from './db.js';
import { logger } from './logger.js';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Check if Cloudflare redirects are enabled
 */
export function isEnabled() {
  return config.cloudflare.enabled && config.cloudflare.apiToken;
}

/**
 * Make authenticated request to Cloudflare API
 */
async function cfFetch(endpoint, options = {}) {
  const url = `${CF_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.cloudflare.apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const data = await response.json();

  if (!data.success) {
    const errors = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
    throw new Error(`Cloudflare API error: ${errors}`);
  }

  return data;
}

/**
 * Get or create the redirect list
 * Returns the list ID
 */
async function getOrCreateRedirectList() {
  const { accountId, redirectListName } = config.cloudflare;

  // List existing lists
  const listsResponse = await cfFetch(`/accounts/${accountId}/rules/lists`);
  const existingList = listsResponse.result?.find(l => l.name === redirectListName);

  if (existingList) {
    return existingList.id;
  }

  // Create new list
  const createResponse = await cfFetch(`/accounts/${accountId}/rules/lists`, {
    method: 'POST',
    body: JSON.stringify({
      name: redirectListName,
      kind: 'redirect',
      description: 'SifterSearch URL redirects for SEO'
    })
  });

  logger.info({ listId: createResponse.result.id }, 'Created Cloudflare redirect list');
  return createResponse.result.id;
}

/**
 * Push a single redirect to Cloudflare
 * Called when a new redirect is created
 */
export async function pushRedirect(oldPath, newPath) {
  if (!isEnabled()) {
    logger.debug({ oldPath, newPath }, 'Cloudflare redirects disabled, skipping push');
    return false;
  }

  try {
    const listId = await getOrCreateRedirectList();
    const { accountId } = config.cloudflare;

    // Add redirect to list
    await cfFetch(`/accounts/${accountId}/rules/lists/${listId}/items`, {
      method: 'POST',
      body: JSON.stringify([{
        redirect: {
          source_url: oldPath,
          target_url: newPath,
          status_code: 301,
          preserve_query_string: true
        }
      }])
    });

    // Mark as synced in database
    await query(`
      UPDATE redirects SET cf_synced = 1, cf_synced_at = datetime('now')
      WHERE old_path = ?
    `, [oldPath]);

    logger.info({ oldPath, newPath }, 'Pushed redirect to Cloudflare');
    return true;
  } catch (err) {
    logger.error({ err: err.message, oldPath, newPath }, 'Failed to push redirect to Cloudflare');
    return false;
  }
}

/**
 * Full sync: Push all unsynced redirects to Cloudflare
 * Called periodically or manually
 */
export async function syncAllRedirects() {
  if (!isEnabled()) {
    logger.info('Cloudflare redirects disabled, skipping sync');
    return { synced: 0, failed: 0 };
  }

  try {
    const listId = await getOrCreateRedirectList();
    const { accountId } = config.cloudflare;

    // Get all redirects that haven't been synced
    const unsynced = await queryAll(`
      SELECT old_path, new_path FROM redirects
      WHERE cf_synced = 0 OR cf_synced IS NULL
    `);

    if (unsynced.length === 0) {
      logger.info('All redirects already synced to Cloudflare');
      return { synced: 0, failed: 0 };
    }

    // Cloudflare accepts up to 1000 items per request
    const BATCH_SIZE = 1000;
    let synced = 0;
    let failed = 0;

    for (let i = 0; i < unsynced.length; i += BATCH_SIZE) {
      const batch = unsynced.slice(i, i + BATCH_SIZE);

      try {
        await cfFetch(`/accounts/${accountId}/rules/lists/${listId}/items`, {
          method: 'POST',
          body: JSON.stringify(batch.map(r => ({
            redirect: {
              source_url: r.old_path,
              target_url: r.new_path,
              status_code: 301,
              preserve_query_string: true
            }
          })))
        });

        // Mark batch as synced
        const paths = batch.map(r => r.old_path);
        await query(`
          UPDATE redirects SET cf_synced = 1, cf_synced_at = datetime('now')
          WHERE old_path IN (${paths.map(() => '?').join(',')})
        `, paths);

        synced += batch.length;
      } catch (err) {
        logger.error({ err: err.message, batchSize: batch.length }, 'Failed to sync redirect batch');
        failed += batch.length;
      }
    }

    logger.info({ synced, failed, total: unsynced.length }, 'Completed Cloudflare redirect sync');
    return { synced, failed };
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to sync redirects to Cloudflare');
    return { synced: 0, failed: -1 };
  }
}

/**
 * Remove a redirect from Cloudflare
 * Called when a redirect is deleted
 */
export async function removeRedirect(oldPath) {
  if (!isEnabled()) {
    return false;
  }

  try {
    const listId = await getOrCreateRedirectList();
    const { accountId } = config.cloudflare;

    // Get list items to find the one to delete
    const itemsResponse = await cfFetch(`/accounts/${accountId}/rules/lists/${listId}/items`);
    const item = itemsResponse.result?.find(i => i.redirect?.source_url === oldPath);

    if (item) {
      await cfFetch(`/accounts/${accountId}/rules/lists/${listId}/items`, {
        method: 'DELETE',
        body: JSON.stringify({ items: [{ id: item.id }] })
      });
      logger.info({ oldPath }, 'Removed redirect from Cloudflare');
    }

    return true;
  } catch (err) {
    logger.error({ err: err.message, oldPath }, 'Failed to remove redirect from Cloudflare');
    return false;
  }
}

/**
 * Get sync status for monitoring
 */
export async function getSyncStatus() {
  const stats = await queryAll(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN cf_synced = 1 THEN 1 ELSE 0 END) as synced,
      SUM(CASE WHEN cf_synced = 0 OR cf_synced IS NULL THEN 1 ELSE 0 END) as pending
    FROM redirects
  `);

  return {
    enabled: isEnabled(),
    ...stats[0]
  };
}
