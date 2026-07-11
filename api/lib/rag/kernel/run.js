// kernel/run — bounded-concurrency map. Runs worker(item, i) over items with at most `conc` in flight,
// results in input order. The pipeline's one parallelism primitive (segments/paragraphs), so fan-out is
// always capped.
export async function pool(conc, items, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runner = async () => { while (next < items.length) { const i = next++; results[i] = await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(conc, items.length) || 0 }, runner));
  return results;
}
