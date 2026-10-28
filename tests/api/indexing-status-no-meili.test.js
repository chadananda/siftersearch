// Meilisearch retired 10-21: getIndexingStatus must answer, not throw (it crash-looped the library watcher into a re-scan every 2.5 min).
import { it, expect } from 'vitest';
import config from '../../api/lib/config.js';
import { getIndexingStatus } from '../../api/services/indexer.js';
it('returns an empty queue when search is disabled', async () => {
  const was = config.search.enabled; config.search.enabled = false;
  try { expect(await getIndexingStatus()).toEqual({ pending: 0, tasks: [] }); } finally { config.search.enabled = was; }
});
