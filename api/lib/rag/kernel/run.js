// kernel/run — bounded-concurrency map. Runs worker(item, i) over items with at most `conc` in flight,
// results in input order. The pipeline's one parallelism primitive (segments/paragraphs), so fan-out is
// always capped. `onProgress(done, total)` fires after EACH item settles — this is how every long stage
// reports real within-stage progress: the job size is known up front (items.length), so the bar climbs per
// unit of work and a flat bar means work actually stopped, never just "unobserved activity".
export async function pool(conc, items, worker, onProgress) {
  const results = new Array(items.length);
  const total = items.length;
  let next = 0, done = 0;
  const runner = async () => {
    while (next < total) {
      const i = next++;
      results[i] = await worker(items[i], i);
      done += 1;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, total) || 0 }, runner));
  return results;
}
