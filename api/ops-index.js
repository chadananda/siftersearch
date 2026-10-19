// THE OPS SERVICE (siftersearch-ops): ops reports and the service health view — tiny and rarely changed, so the
// coordinator and Chad can see every service through every other service's update.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { startApi } from './lib/api-runtime.js';
import { OPS_ROUTES } from './routes/sets/ops.js';

await startApi({ name: 'siftersearch-ops', routes: OPS_ROUTES, role: 'ops' });
