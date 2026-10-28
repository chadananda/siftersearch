// "How is it going?" in plain words, from the registry (chat tool, email verb, chat card). Pure text builders + one reader.
import * as realRepo from '../../repos/dewey-jobs-repo.js';
import { isTerminal } from './states.js';
import { docUrl } from './live.js';

const mb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

export function labelOf(job) {
  const p = job.params || {};
  if (job.kind === 'fetch') return `the file from ${hostOf(p.url) || 'your link'}`;
  if (job.kind === 'archive') return `your ZIP “${p.name || 'archive'}”`;
  if (job.kind === 'media') return `the recording “${p.name || hostOf(p.url) || 'media'}”`;
  if (job.kind === 'file') return `“${p.name || 'a file'}”`;
  return `“${p.title || p.name || `item ${job.item_id || job.id}`}”`;
}

/** ETA phrase: "about 6 minutes" only when the registry has numbers (3+ samples), else "a few minutes". */
export function etaPhrase(job, now = Date.now()) {
  if (!job.eta_at) return null;
  const s = (Date.parse(job.eta_at) - now) / 1000;
  if (!(s > 0)) return 'any moment now';
  return s < 90 ? 'about a minute' : `about ${Math.round(s / 60)} minutes`;
}

/** One sentence per job. kids = its children (top-level jobs only). */
export function statusLine(job, kids = [], now = Date.now()) {
  const label = labelOf(job), c = job.counts || {};
  const eta = etaPhrase(job, now);
  const tally = () => {
    const bits = [];
    if (c.dupes) bits.push(`${c.dupes} already in the library`);
    if (c.added) bits.push(`${c.added} added`);
    if (c.handed) bits.push(`${c.handed} sent to the media library`);
    if (c.skipped) bits.push(`${c.skipped} skipped`);
    if (c.awaiting) bits.push(`${c.awaiting} waiting for your decision`);
    if (c.failed) bits.push(`${c.failed} could not be read`);
    return bits;
  };
  switch (job.state) {
    case 'published': case 'handed-off': case 'skipped': case 'failed': case 'cancelled': {
      if (job.state === 'failed') return `${label}: it did not work out — ${job.error || 'an error'}.`;
      if (c.found) return `${label}: done. ${plural(c.found, 'file')} — ${tally().join(', ') || 'nothing new'}.`;
      if (job.state === 'skipped') return `${label}: nothing to add (${job.result?.reason === 'duplicate' ? 'already in the library' : job.result?.reason || 'skipped'}).`;
      if (job.state === 'handed-off') return `${label}: passed to the media library, which transcribes and publishes it on its own.`;
      return job.result?.url ? `${label}: published — ${job.result.url}` : `${label}: done.`;
    }
    case 'awaiting-decision': return `${label}: ${job.question?.text || 'waiting for your decision.'}${c.found ? ` (${plural(c.found, 'file')}: ${tally().join(', ')})` : ''}`;
    case 'received': return job.step === 'waiting for a worker' ? `${label}: queued — waiting for a free worker machine (this never runs on the main server).` : `${label}: received${job.step === 'retry' ? ' (retrying shortly)' : ''}.`;
    case 'fetching': return `${label}: downloading${c.fetched_bytes ? ` — ${mb(c.fetched_bytes)}${c.total_bytes ? ` of ${mb(c.total_bytes)}` : ''}` : ''}${eta ? `, ${eta} left` : ''}.`;
    default: {
      if (c.found) return `${label}: ${plural(c.found, 'file')}; ${c.checked || 0} checked${tally().length ? `, ${tally().join(', ')}` : ''}${eta ? `. ${eta[0].toUpperCase()}${eta.slice(1)} left` : ''}.`;
      const stage = { check: 'checking it against the library', ingest: 'importing it', ocr: 'reading the scan', research: 'looking for a copy', indexing: 'making it searchable', children: 'working through its files' }[job.step] || job.step || job.state;
      return `${label}: ${stage}.`;
    }
  }
}

/** What a person asked about: their active jobs, else the last few finished. → { jobs:[{id,kind,state,line,url?}], text } */
export async function statusFor(by, { jobId = null, repo = realRepo, now = Date.now() } = {}) {
  let jobs;
  if (jobId) { const j = await repo.getJob(jobId); jobs = j && (!j.created_by || j.created_by.toLowerCase() === String(by).toLowerCase()) ? [j] : []; }
  else {
    jobs = await repo.jobsOf(by, { limit: 8, activeOnly: true });
    if (!jobs.length) jobs = (await repo.jobsOf(by, { limit: 5 })).filter((j) => j.kind !== 'intake' || !j.notify?.quiet || !isTerminal(j.state)).slice(0, 5);
  }
  const rows = [];
  for (const j of jobs) rows.push({ id: j.id, kind: j.kind, state: j.state, step: j.step, counts: j.counts, eta_at: j.eta_at, line: statusLine(j, [], now), url: j.result?.doc_id ? docUrl(j.result.doc_id) : j.result?.url || null });
  return { jobs: rows, text: rows.length ? rows.map((r) => `• ${r.line}`).join('\n') : 'Nothing is in progress for you right now.' };
}
