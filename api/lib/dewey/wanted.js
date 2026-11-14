// Put a work on Dewey's wanted list: an open item with the same title is returned instead (existing: true); a new one queues research
// (metadata only — research never fetches a source). Shared by POST /api/dewey/items (members) and POST /ops/dewey-wanted (internal key).
export async function addWanted(identified, by, deps = {}) {
  const repo = deps.repo || await import('../repos/dewey-repo.js');
  const enqueue = deps.enqueue || (await import('../repos/ops-report-repo.js')).enqueue;
  const id = identified || {};
  if (!id.title) throw Object.assign(new Error('a wanted item needs a title'), { statusCode: 400 });
  const existing = await repo.findOpenByTitle(id.title);
  if (existing) return { item: existing, existing: true };
  const item = await repo.createItem({ title: id.title, author: id.author || null, kind: id.kind || null, identified: id, by });
  await enqueue('dewey-research', { id: item.id }, by || 'dewey');
  return { item };
}
