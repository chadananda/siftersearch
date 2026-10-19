// The API with EVERY route (tests, and the search API until the split goes live). The shared server is
// api/lib/http-server.js; each service registers its own set from api/routes/sets/ (docs/architecture/continuous-deploy.md).
import { createHttpServer } from './lib/http-server.js';
import { ALL_ROUTES } from './routes/sets/all.js';

export async function createServer(opts = {}) {
  return createHttpServer({ routes: ALL_ROUTES, ...opts });
}
