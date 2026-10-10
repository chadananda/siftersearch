// Worker thread for bio.getIntegrationProgress: computes the grounding roadmap OFF the API's event loop (own module graph,
// own SQLite read connection) and posts it back as JSON. Spawned per cache miss; exits after one answer.
import { parentPort } from 'worker_threads';
import { computeIntegrationProgress } from './bio.js';

try {
  parentPort.postMessage({ json: JSON.stringify(await computeIntegrationProgress()) });
} catch (err) {
  parentPort.postMessage({ error: String(err?.message || err) });
}
