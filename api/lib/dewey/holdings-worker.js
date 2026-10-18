// Worker thread for Dewey's holdings check of IDENTIFIED fields (title, photo-read lines, a pasted passage): the title search,
// the probes and the full-text comparison run OFF the API's event loop on their own SQLite read connection — one check froze
// the whole API for 573 s on 10-17. Whole DOCUMENTS go to a child process instead (holdings-child.mjs: their memory).
import { parentPort, workerData } from 'worker_threads';
import { checkHoldings } from './holdings.js';
import { withText } from './identify.js';

try {
  const id = workerData.text != null ? withText(workerData.id, workerData.text) : workerData.id;
  parentPort.postMessage({ json: JSON.stringify(await checkHoldings(id)) });
} catch (err) {
  parentPort.postMessage({ error: String(err?.message || err) });
}
