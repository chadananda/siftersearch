#!/usr/bin/env node
/**
 * Sync Redirects to Cloudflare
 *
 * Pushes all unsynced redirects to Cloudflare Bulk Redirects.
 * Can be run manually or as a cron job for periodic sync.
 *
 * Usage:
 *   node scripts/sync-redirects-to-cloudflare.js [--force]
 *
 * Options:
 *   --force    Re-sync all redirects, even if already marked as synced
 *
 * Environment:
 *   CLOUDFLARE_REDIRECTS_ENABLED=true  Enable CF sync
 *   CLOUDFLARE_API_TOKEN=xxx           API token with redirect permissions
 *
 * Add to crontab for periodic sync (every 5 minutes):
 *   0,5,10,15,20,25,30,35,40,45,50,55 * * * * node /path/to/project/scripts/sync-redirects-to-cloudflare.js
 */

import { syncAllRedirects, getSyncStatus, isEnabled } from '../api/lib/cloudflare-redirects.js';
import { query } from '../api/lib/db.js';

const force = process.argv.includes('--force');

async function main() {
  console.log('Cloudflare Redirect Sync');
  console.log('========================');

  // Check if enabled
  if (!isEnabled()) {
    console.log('');
    console.log('⚠️  Cloudflare redirects are disabled.');
    console.log('   Set CLOUDFLARE_REDIRECTS_ENABLED=true to enable.');
    console.log('');

    // Still show status for reference
    const status = await getSyncStatus();
    console.log('Database Status:');
    console.log(`  Total redirects: ${status.total}`);
    console.log(`  Would sync: ${status.pending}`);
    process.exit(0);
  }

  // If force, reset all sync flags
  if (force) {
    console.log('');
    console.log('Force mode: resetting all sync flags...');
    await query('UPDATE redirects SET cf_synced = 0, cf_synced_at = NULL');
  }

  // Get initial status
  const beforeStatus = await getSyncStatus();
  console.log('');
  console.log('Before sync:');
  console.log(`  Total redirects: ${beforeStatus.total}`);
  console.log(`  Already synced: ${beforeStatus.synced}`);
  console.log(`  Pending sync: ${beforeStatus.pending}`);

  if (beforeStatus.pending === 0) {
    console.log('');
    console.log('✅ All redirects already synced!');
    process.exit(0);
  }

  // Perform sync
  console.log('');
  console.log('Syncing to Cloudflare...');
  const result = await syncAllRedirects();

  // Get final status
  const afterStatus = await getSyncStatus();

  console.log('');
  console.log('Sync complete:');
  console.log(`  Synced: ${result.synced}`);
  console.log(`  Failed: ${result.failed}`);
  console.log('');
  console.log('After sync:');
  console.log(`  Total redirects: ${afterStatus.total}`);
  console.log(`  Synced to CF: ${afterStatus.synced}`);
  console.log(`  Pending: ${afterStatus.pending}`);

  if (result.failed > 0) {
    console.log('');
    console.log('⚠️  Some redirects failed to sync. Run again to retry.');
    process.exit(1);
  }

  console.log('');
  console.log('✅ Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
