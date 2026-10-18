// Child PROCESS for Dewey's document check (read → convert → OCR → compare). A process, not a thread: its memory is its
// own — a 270 MB book parsed in a worker THREAD counted toward the API and pm2 restarted the API at 3 GB (10-18). If this
// runs out of memory, only it dies. Queries are tagged 'dewey-holdings' (SIFTER_PROC), never as API freezes.
import { identifyAndCheck } from './holdings.js';

process.once('message', async (m) => {
  try {
    const out = await identifyAndCheck(m);
    process.send({ json: JSON.stringify(out) }, () => process.exit(0));
  } catch (err) {
    process.send({ error: String(err?.message || err) }, () => process.exit(1));
  }
});
