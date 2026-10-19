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
