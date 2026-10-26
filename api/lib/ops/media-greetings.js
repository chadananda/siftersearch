// Existing transcripts: repair only an unambiguous opening greeting; report other occurrences for review.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
export function greetingEdits(work) {
  const edits = [], review = [];
  for (const [pi, p] of (work.paragraphs || []).entries()) {
    const words = p.words || [];
    for (const [i, word] of words.entries()) {
      if (fold(word.w) !== 'allahuakbar') continue;
      const context = words.slice(Math.max(0, i - 12), i + 20).map(w => w.w).join(' ');
      if (pi < 3 && i === 0 && p.t0 < 120 && /^friends?$/.test(fold(words[1]?.w))) {
        edits.push({ paragraph: p.n, index: i, before: word.w, after: 'Alláh-u-Abhá' + (word.w.match(/[^\p{L}]+$/u)?.[0] || ''), context });
      } else review.push({ paragraph: p.n, index: i, word: word.w, context });
    }
  }
  return { edits, review };
}
export async function mediaGreetingsJob({ ids = null, write = false, limit = 20, after = 0 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const rows = (await repo.mediaIndexRows()).filter(r => r.id > after && (!ids || ids.includes(r.id))).sort((a,b) => a.id-b.id).slice(0, Math.max(1, Math.min(100, limit)));
  const pending = (await Promise.all(['media-item','media-remaster','media-llm','media-compute','media-asr','media-diar'].map(n => ops.pendingRuns(n)))).flat();
  const busy = new Set(pending.filter(r => r.status === 'running').map(r => Number(r.params?.id)));
  const result = { scanned: 0, changed: [], review: [], skipped: [], next_after: after };
  for (const row of rows) {
    result.next_after = row.id;
    if (busy.has(row.id)) { result.skipped.push({ id: row.id, why: 'processing' }); continue; }
    if (!row.dir) continue;
    const file = join(row.dir, 'transcript.work.json');
    let raw; try { raw = await readFile(file, 'utf8'); } catch { continue; }
    const work = JSON.parse(raw), found = greetingEdits(work); result.scanned++;
    result.review.push(...found.review.map(r => ({ id: row.id, slug: row.slug, ...r })));
    if (!found.edits.length) continue;
    if (write) {
      if (await readFile(file, 'utf8') !== raw) { result.skipped.push({ id: row.id, why: 'transcript changed' }); continue; }
      const dir = deps.auditDir || join(process.cwd(), 'data/run/media-greetings'); await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${row.id}-${Date.now()}.json`), JSON.stringify({ id: row.id, edits: found.edits, at: new Date().toISOString() }, null, 2));
      for (const e of found.edits) work.paragraphs.find(p => p.n === e.paragraph).words[e.index].w = e.after;
      await writeFile(file + '.greeting.tmp', JSON.stringify(work, null, 2)); await rename(file + '.greeting.tmp', file);
      await ops.enqueue('media-item', { id: row.id, only: ['render','ingest'], redo: ['render','ingest'] }, 'media-greetings');
    }
    result.changed.push({ id: row.id, slug: row.slug, edits: found.edits, write });
  }
  return result;
}
