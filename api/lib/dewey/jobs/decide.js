// The person's answer to "new works are waiting": add them or keep them out (job page buttons, signed per job and action).
// Works only on this job's children that are waiting (`offered` items); the existing intake path takes the yes from there.
import * as realRepo from '../../repos/dewey-jobs-repo.js';
import { whoOf } from './policy.js';

export async function decide(jobId, action, { repo = realRepo, items = null, enqueue = null, by = 'job page' } = {}) {
  const it = items || (await import('../../repos/dewey-repo.js'));
  const q = enqueue || (await import('../../repos/ops-report-repo.js')).enqueue;
  const kids = await repo.childrenOf(jobId);
  const out = { added: 0, kept_out: 0, skipped: 0 };
  for (const k of kids.filter((x) => x.state === 'awaiting-decision' && x.item_id)) {
    const item = await it.getItem(k.item_id);
    if (!item || item.state !== 'offered') { out.skipped++; continue; }
    if (action === 'add') { await it.updateItem(item.id, { state: 'source' }, `accepted by ${whoOf(by)} on the job page`); await q('dewey-intake', { id: item.id }, by); out.added++; }
    else { await it.updateItem(item.id, { state: 'declined' }, `declined by ${whoOf(by)} on the job page`); out.kept_out++; }
    await repo.addEvent(k.id, 'decision', { action, by: whoOf(by) });
    await repo.schedule(k.id, new Date().toISOString());
  }
  return out;
}
