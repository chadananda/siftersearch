// DEWEY STAGE 0 (Chad 10-24): before any GPU-heavy stage a worker sends tower a fingerprint + the first ~2 min of transcript; tower (text only,
// seconds) answers { verdict: 'duplicate', of: slug } or { verdict: 'new' }. A duplicate aborts the job, so a file we already hold is never paid for.
// Same path serves a single file from a contributor. Preview jobs go ahead of bulk work (previewFirst) and run on a free boss/aorus before any pod.
import { join } from 'path';
import { readFile } from 'fs/promises';

const words = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** Word-5-gram Jaccard of two transcripts' openings (robust to ASR differences in a few words, to leading silence and to a different start offset). */
export function openingSimilarity(a, b, n = 220) {
  const grams = (ws) => { const s = new Set(); for (let i = 0; i + 5 <= ws.length; i++) s.add(ws.slice(i, i + 5).join(' ')); return s; };
  const A = grams(words(a).slice(0, n)), B = grams(words(b).slice(0, n));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const g of A) if (B.has(g)) hit++;
  return hit / Math.min(A.size, B.size);
}

export const DUP_THRESHOLD = 0.5;
/** { fingerprint?, text, duration_s } → { verdict, of?, score }. Candidates: same length ±3 %; fingerprint equality (exact audio) wins outright. */
export async function previewVerdict({ fingerprint = null, text = '', duration_s = 0 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const read = deps.readOpening || (async (it) => {
    const w = JSON.parse(await readFile(join(it.dir, 'transcript.work.json'), 'utf8').catch(() => 'null'));
    return (w?.paragraphs || []).slice(0, 6).map((p) => p.text || (p.words || []).map((x) => x.w).join(' ')).join(' ');
  });
  const cands = duration_s > 0 ? await repo.itemsNearDuration(duration_s) : [];
  let best = { score: 0, of: null };
  for (const it of cands) {
    if (fingerprint && it.fingerprint && it.fingerprint === fingerprint) return { verdict: 'duplicate', of: it.slug, score: 1, by: 'fingerprint' };
    if (!text) continue;
    const score = openingSimilarity(text, await read(it));
    if (score > best.score) best = { score, of: it.slug };
  }
  return best.score >= DUP_THRESHOLD ? { verdict: 'duplicate', of: best.of, score: Math.round(best.score * 100) / 100, by: 'opening-text' } : { verdict: 'new', score: Math.round(best.score * 100) / 100 };
}

/** Queue order: previews first (Dewey waits for them, and a duplicate must never reach a pod), then bulk. Stable. */
export const previewFirst = (jobs) => [...jobs].sort((a, b) => (b.kind === 'preview') - (a.kind === 'preview'));

/** Where a preview runs: a free local worker (boss below 85 °C, aorus with no ASR waiting and VRAM free), a pod only when neither is free. */
export function previewHost({ boss = {}, aorus = {}, pod = null } = {}) {
  if (boss.ok && boss.temp_c < 85) return 'boss';
  if (aorus.ok && !aorus.asr_waiting && aorus.vram_free_gb >= 1.5) return 'aorus';
  return pod ? 'pod' : null;
}
