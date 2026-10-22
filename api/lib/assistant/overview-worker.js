// Worker thread for admin-overview.getAnisOverview: computes the Anís hub data OFF the API's event loop (own module graph, own
// SQLite read connections — tagged '<proc>/thread') and posts it back as JSON. Spawned per cache miss; exits after one answer.
import { parentPort, workerData } from 'worker_threads';
import { computeAnisOverview } from './admin-overview.js';

try {
  parentPort.postMessage({ json: JSON.stringify(await computeAnisOverview(workerData.days)) });
} catch (err) {
  parentPort.postMessage({ error: String(err?.message || err) });
}
