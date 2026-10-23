// LATE-BOUND imports of code OUTSIDE the media domain (search, the source hunt, biography, docs, the ingester). The deploy
// coordinator (scripts/lib/import-graph.mjs) follows literal imports to decide which services a push reloads; these are
// written as repo paths so it does NOT follow them, and a push to search or biography no longer drains the media service
// (10-23: 88 media restarts in a night, each one throwing away prep). The media service picks those modules up at its
// next restart. Deps: none.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** import a module by its repo path ('api/lib/bio.js'). */
export const late = (repoPath) => import(pathToFileURL(join(ROOT, repoPath)).href);
