// THE ANÍS SERVICE (siftersearch-anis): conversations, letters, the reading guide, the widget — its own process, so an
// Anís update reloads only Anís, and a search or indexing update never touches a conversation in progress.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { startApi } from './lib/api-runtime.js';
import { ANIS_ROUTES } from './routes/sets/anis.js';

await startApi({ name: 'siftersearch-anis', routes: ANIS_ROUTES, role: 'anis' });

// the book finder and title index warm as soon as the service is up, not on the first reader's turn (11-10 live: Gita card
// 13 s on a fresh process vs ~1 s warm). title-answer.js schedules the build itself, off the boot path.
setTimeout(() => import('./lib/assistant/title-answer.js').catch(() => {}), 2000).unref?.();

// the tool catalog (anis-tools-repo): tools.js code-tool metadata → tools.db once per deploy, by instance 0 only (hash-checked, a no-op
// when unchanged). The ops service never does it: it stays off tools.js's import graph. A failure leaves the code tools running.
if ((process.env.NODE_APP_INSTANCE ?? '0') === '0') {
  setTimeout(() => Promise.all([import('./lib/repos/anis-tools-repo.js'), import('./lib/assistant/tools.js')])
    .then(([R, T]) => { const r = R.syncCodeTools(R.toolsDb(), T.codeToolMeta()); if (!r.unchanged) console.log('[anis] tool catalog synced', r); })
    .catch((err) => console.warn(`[anis] tool catalog sync failed (code tools still run): ${err.message}`)), 3000).unref?.();
}
