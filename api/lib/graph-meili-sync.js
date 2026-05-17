// Sync entity aliases to Meilisearch paragraphs index as synonyms.
// CRITICAL: always preserve embedder config on every PATCH.
import { queryAll } from './db.js';
import { logger } from './logger.js';
import { config } from './config.js';

function getMeiliHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.MEILISEARCH_API_KEY || config.search?.apiKey || ''}`,
  };
}

/**
 * Build a synonym map from entity_aliases table:
 *   canonical_name ↔ [all alias surfaces]
 * Returns { canonicalName: [aliases...], ... }
 */
async function buildSynonymMap() {
  const rows = await queryAll(`
    SELECT ge.canonical_name, ea.surface
    FROM entity_aliases ea
    JOIN graph_entities ge ON ge.id = ea.entity_id
    WHERE ea.confidence >= 0.8
    ORDER BY ge.canonical_name
  `);

  const map = {};
  for (const row of rows) {
    const canon = row.canonical_name;
    if (!map[canon]) map[canon] = new Set([canon]);
    map[canon].add(row.surface);
  }

  // Convert to Meilisearch synonyms format: each group is bidirectional
  const synonyms = {};
  for (const [canon, surfaceSet] of Object.entries(map)) {
    const forms = [...surfaceSet].filter(s => s !== canon);
    if (forms.length === 0) continue;
    synonyms[canon] = forms;
    for (const form of forms) {
      if (!synonyms[form]) synonyms[form] = [];
      if (!synonyms[form].includes(canon)) synonyms[form].push(canon);
    }
  }

  return synonyms;
}

/**
 * Fetch current embedder config from paragraphs index to preserve it.
 */
async function getCurrentEmbedder(host) {
  try {
    const res = await fetch(`${host}/indexes/paragraphs/settings/embedders`, {
      headers: getMeiliHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Patch paragraphs index synonyms without touching the embedder config.
 * Meilisearch PATCH /settings merges — but /settings/synonyms replaces.
 * We use /settings with only the synonyms key so other settings are untouched.
 */
export async function syncAliasesToMeili() {
  const host = process.env.MEILISEARCH_HOST || config.search?.host || 'http://localhost:7700';

  const synonyms = await buildSynonymMap();
  const synonymCount = Object.keys(synonyms).length;

  if (synonymCount === 0) {
    logger.info('No entity aliases to sync to Meilisearch');
    return { synonymCount: 0 };
  }

  // Verify embedder config is intact before patching
  const embedder = await getCurrentEmbedder(host);
  if (!embedder?.default?.dimensions) {
    logger.warn('Could not verify embedder config before synonym sync — proceeding with caution');
  }

  const res = await fetch(`${host}/indexes/paragraphs/settings`, {
    method: 'PATCH',
    headers: getMeiliHeaders(),
    body: JSON.stringify({ synonyms }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meilisearch synonym PATCH failed: ${err}`);
  }

  // Verify embedder still intact
  const embedderAfter = await getCurrentEmbedder(host);
  const dims = embedderAfter?.default?.dimensions;
  if (dims && dims !== 512) {
    logger.error({ dims }, 'CRITICAL: embedder dimensions changed after synonym sync');
  }

  logger.info({ synonymCount, embedderDimensions: dims }, 'Entity aliases synced to Meilisearch');
  return { synonymCount, embedderDimensions: dims };
}
