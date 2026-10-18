// Worker thread for Dewey's holdings check: the title search, the probes and the full-text comparison (shingling whole
// library books is CPU work) run OFF the API's event loop, on their own SQLite read connection. One check froze the whole
// API for 573 s on 10-17 (a per-row FTS MATCH); off-thread, a slow check can only be slow, never a freeze. One answer, exit.
import { parentPort, workerData } from 'worker_threads';
import { checkHoldings } from './holdings.js';
import { withText } from './identify.js';

try {
  const id = workerData.text != null ? withText(workerData.id, workerData.text) : workerData.id;
  parentPort.postMessage({ json: JSON.stringify(await checkHoldings(id)) });
} catch (err) {
  parentPort.postMessage({ error: String(err?.message || err) });
}
