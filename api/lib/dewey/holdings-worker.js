// Worker thread for Dewey's holdings check: reading and converting the document (a 280 MB PDF is seconds of CPU), the
// title search, the probes and the full-text comparison all run OFF the API's event loop, on their own SQLite read
// connection. One check froze the whole API for 573 s on 10-17 (a per-row FTS MATCH); off-thread, a slow check can only be
// slow, never a freeze. Modes: { id, text } = check identified fields; { file | path } = identify the document, then check.
import { parentPort, workerData } from 'worker_threads';
import { checkHoldings, identifyAndCheck } from './holdings.js';
import { withText } from './identify.js';

try {
  if (workerData.file || workerData.path) parentPort.postMessage({ json: JSON.stringify(await identifyAndCheck(workerData)) });
  else {
    const id = workerData.text != null ? withText(workerData.id, workerData.text) : workerData.id;
    parentPort.postMessage({ json: JSON.stringify(await checkHoldings(id)) });
  }
} catch (err) {
  parentPort.postMessage({ error: String(err?.message || err) });
}
