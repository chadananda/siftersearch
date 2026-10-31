// Dewey compares exact fingerprints and transcript samples. A shared opening is overlap, not proof of duplication: only separate
// opening and middle matches auto-mark a duplicate; ambiguous matches are held for review, and numbered series parts stay distinct.
import { join } from 'path';
import { readFile } from 'fs/promises';

export const words = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** Word-5-gram Jaccard of two transcripts' openings (robust to ASR differences in a few words, to leading silence and to a different start offset). */
export function openingSimilarity(a, b, n = 220) {
  const grams = (ws) => { const s = new Set(); for (let i = 0; i + 5 <= ws.length; i++) s.add(ws.slice(i, i + 5).join(' ')); return s; };
  const A = grams(words(a).slice(0, n)), B = grams(words(b).slice(0, n));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const g of A) if (B.has(g)) hit++;
  return hit / Math.min(A.size, B.size);
}

export const DUP_THRESHOLD = 0.5;
const asText = (v) => Array.isArray(v) ? v.map((x) => typeof x === 'string' ? x : x?.text || x?.w || '').join(' ') : String(v?.text || v || '');
const sampleWindows = (v) => {
  if (Array.isArray(v?.windows) && v.windows.length >= 2) return v.windows.slice(0, 2).map(asText);
  const ws = words(asText(v));
  if (ws.length < 440) return ws.length ? [ws.slice(0, 220).join(' ')] : [];
  const mid = Math.floor(ws.length / 2);
  return [ws.slice(0, 220).join(' '), ws.slice(mid, mid + 220).join(' ')];
};

/** Different numbered installments in a named lecture/part/session series are not duplicates. */
export function differentSeriesParts(a = '', b = '') {
  const mark = (title) => {
    const s = String(title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ');
    const m = /\b(lecture|part|session|lesson|class)[\s\-:#]*(?:no\.?\s*)?(\d+)\b/i.exec(s);
    if (!m) return null;
    const family = s.replace(m[0], ` ${m[1]} # `).replace(/[^a-z0-9#]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { family, part: Number(m[2]) };
  };
  const x = mark(a), y = mark(b);
  return !!x && !!y && x.family === y.family && x.part !== y.part;
}

/** { fingerprint?, text, windows?, duration_s } → duplicate | review | new. One matching span can request review, never an auto duplicate. */
export async function previewVerdict({ fingerprint = null, text = '', windows = null, duration_s = 0, title = '', excludeId = null } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const read = deps.readOpening || (async (it) => {
    const w = JSON.parse(await readFile(join(it.dir, 'transcript.work.json'), 'utf8').catch(() => 'null'));
    if (w?.paragraphs?.length) return w.paragraphs.map((p) => p.text || (p.words || []).map((x) => x.w).join(' ')).join(' ');
    const raw = JSON.parse(await readFile(join(it.dir, 'transcript.raw.json'), 'utf8').catch(() => 'null'));
    return (raw?.segments || []).map((p) => p.text || (p.words || []).map((x) => x.w).join(' ')).join(' ');
  });
  const cands = duration_s > 0 ? await repo.itemsNearDuration(duration_s) : [];
  const current = sampleWindows({ text, windows });
  let review = null, bestScore = 0;
  for (const it of cands) {
    if (excludeId != null && Number(it.id) === Number(excludeId)) continue;
    if (fingerprint && it.fingerprint && it.fingerprint === fingerprint) return { verdict: 'duplicate', of: it.slug, score: 1, by: 'fingerprint' };
    if (!current.length) continue;
    const prior = sampleWindows(await read(it));
    const open = openingSimilarity(current[0], prior[0] || '');
    const middle = current[1] && prior[1] ? openingSimilarity(current[1], prior[1]) : null;
    if (differentSeriesParts(title, it.title)) continue;
    bestScore = Math.max(bestScore, open);
    if (middle != null && open >= DUP_THRESHOLD && middle >= DUP_THRESHOLD)
      return { verdict: 'duplicate', of: it.slug, score: Math.round(Math.min(open, middle) * 100) / 100,
        opening_score: Math.round(open * 100) / 100, middle_score: Math.round(middle * 100) / 100, by: 'opening-and-middle-text' };
    if (open >= DUP_THRESHOLD && !review) review = { verdict: 'review', of: it.slug, score: Math.round(open * 100) / 100, by: 'opening-overlap' };
  }
  return review || { verdict: 'new', score: Math.round(bestScore * 100) / 100 };
}

/** Queue order: previews first (Dewey waits for them, and a duplicate must never reach a pod), then bulk. Stable. */
export const previewFirst = (jobs) => [...jobs].sort((a, b) => (b.kind === 'preview') - (a.kind === 'preview'));

/** Where a preview runs: the first free worker of `hosts` (ranked, each { name, ok, temp_c?, asr_waiting?, vram_free_gb? }): reachable, below 85 °C,
 *  no ASR waiting, GPU memory free when it has a GPU; a pod only when none is free. */
export function previewHost({ hosts = [], pod = null } = {}) {
  const free = hosts.find((h) => h.ok && !(h.temp_c >= 85) && !h.asr_waiting && !(h.vram_free_gb != null && h.vram_free_gb < 1.5));
  return free ? free.name : pod ? 'pod' : null;
}
