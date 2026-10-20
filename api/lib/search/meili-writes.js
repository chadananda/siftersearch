// MEILISEARCH WRITES OFF (planning/meili-retirement-plan.md step 5; Chad 10-20 "let's retire meilisearch"). Search reads only
// Qdrant (SEARCH_QDRANT=only), yet the worker still pushed every changed paragraph, HyPE question, mention and alias into
// Meili — the largest I/O on /fast (10-20: ~20 MB/s read, 13 MB/s write, 1,040 write calls/s) while single-row writes
// took 9–27 s and search hydration 2–6 s. MEILI_WRITES=off stops them; changed rows are marked processed so `synced`
// stays a live signal (rollback: re-sync rows updated since the cutover before re-enabling Meili reads).
export const meiliWritesOn = (env = process.env) => String(env.MEILI_WRITES || 'on').toLowerCase() !== 'off';

/** Mark every dirty paragraph processed without sending it anywhere. deps { docs(limit), dirty(docId, limit), markSynced(ids), stop() } */
export async function settleDirty({ docs, dirty, markSynced, stop = () => false, batch = 500 }) {
  let settled = 0;
  for (;;) {
    const page = await docs(batch);
    if (!page.length || stop()) break;
    let progressed = 0;
    for (const doc of page) {
      for (;;) {
        if (stop()) return settled;
        const ids = (await dirty(doc.id, batch)).map((p) => p.id);
        if (!ids.length) break;
        await markSynced(ids);
        settled += ids.length; progressed += ids.length;
        await new Promise((r) => setImmediate(r));
      }
    }
    if (!progressed) break;   // nothing left that this pass can settle — never spin
  }
  return settled;
}
