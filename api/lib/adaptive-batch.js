// Writes in batches that keep each single-writer transaction SHORT (10-23: a 100-row INSERT INTO content batch from the
// media ingest held the writer 9.8 s — each row cost 100–160 ms on the loaded content table). The batch starts at `start`
// rows; a batch slower than `targetMs` shrinks the next in proportion (never below `min`), a fast one grows it back.
export async function adaptiveBatches(statements, run, { start = 100, targetMs = 1500, min = 5, max = start, now = () => Date.now(), yieldFn = () => new Promise((r) => setImmediate(r)) } = {}) {
  let size = start, i = 0, batches = 0;
  while (i < statements.length) {
    const batch = statements.slice(i, i + size);
    const t0 = now();
    await run(batch);
    const ms = now() - t0;
    i += batch.length; batches++;
    if (ms > targetMs) size = Math.max(min, Math.floor(batch.length * targetMs / ms));
    else if (ms < targetMs / 3) size = Math.min(max, size * 2);
    await yieldFn();
  }
  return { batches, size };
}
