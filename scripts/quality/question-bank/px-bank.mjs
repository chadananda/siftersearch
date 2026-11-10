// Question bank vs Perplexity (run.mjs --perplexity / --judge): presentation scored in code (free, every answer), Perplexity answers cached per
// question (tests/quality/question-bank/perplexity/<tradition>.json, fetched once), the Opus source judge (perplexity-compare.mjs) on one question,
// and the per-tradition roll-up. Pure helpers + thin I/O; run.mjs wires them to the live stream.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export const PX_DIR = 'tests/quality/question-bank/perplexity';

const MD_LINK = /\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g;
/** OceanLibrary work slug of a link (the first path segment), or null. Pure. */
export function oceanWork(url) {
  try { const u = new URL(url); return /(^|\.)oceanlibrary\.com$/i.test(u.hostname) ? (u.pathname.split('/').filter(Boolean)[0] || null) : null; } catch { return null; }
}
/**
 * How the answer LOOKS, measured in code from the stream (battery send(): text, events counts, book, citations, ms):
 * passage cards (stream `passage` events), book card (`book` event), quote blocks left as markdown, links — OceanLibrary links and the
 * distinct works they open, bad links (no http(s) target or no label), bare URLs outside a link — words, seconds. Pure.
 */
export function presentation(r) {
  const text = String(r?.text || '');
  const links = [...text.matchAll(MD_LINK)].map((m) => ({ label: m[1].trim(), url: m[2] }));
  const ocean = links.filter((l) => oceanWork(l.url));
  const bad = links.filter((l) => !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(l.url) || !l.label || /^https?:/i.test(l.label));
  const bare = (text.replace(MD_LINK, ' ').match(/https?:\/\/[^\s)>\]]+/g) || []).length;
  const quoteBlocks = text.split('\n').reduce((n, line, i, a) => n + (/^\s*>/.test(line) && !/^\s*>/.test(a[i - 1] ?? '') ? 1 : 0), 0);
  return {
    passage_cards: r?.events?.passage || 0,
    book_card: !!r?.book,
    quote_blocks: quoteBlocks,
    links: links.length,
    ocean_links: ocean.length,
    ocean_works: new Set(ocean.map((l) => oceanWork(l.url))).size,
    bad_links: bad.length,
    bare_urls: bare,
    names_site: /siftersearch/i.test(text.replace(MD_LINK, '$1')),   // Anís never names the site in prose (feedback_anis_public_identity)
    citations: (r?.citations || []).length,
    words: text.split(/\s+/).filter(Boolean).length,
    seconds: r?.ms != null ? +(r.ms / 1000).toFixed(1) : null,
  };
}

/** compareTurn's winner → the bank's verdict. Pure. */
export const verdictOf = (winner) => ({ anis: 'anis_better', px: 'px_better', tie: 'equal', neither: 'neither' }[winner] ?? null);

// ---- the Perplexity cache: question → { text, urls, cost, at }; fetched once, re-fetched only when asked
export function pxCache(tradition, { dir = PX_DIR } = {}) {
  const file = `${dir}/${tradition}.json`;
  let data = { tradition, answers: {} };
  try { if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8')); } catch { /* a corrupt cache is refetched */ }
  data.answers ||= {};
  return {
    get: (q) => data.answers[q] ?? null,
    set: (q, px) => { data.answers[q] = { text: px.text, urls: px.urls, cost: px.cost, cost_measured: px.cost_measured ?? null, ms: px.ms, at: new Date().toISOString() }; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`); },
  };
}
/** The cached answer, else one sonar call (cached when it succeeded). → { px, fetched, cost } (cost = this run's spend). */
export async function pxAnswer(q, cache, { refresh = false, fetchPx }) {
  const hit = !refresh && cache.get(q);
  if (hit?.text) return { px: hit, fetched: false, cost: 0 };
  const px = await fetchPx([{ role: 'user', content: q }]);
  if (px.text && !px.error) cache.set(q, px);
  return { px, fetched: true, cost: px.cost || 0 };
}

/** One bank answer as the one-turn conversation compareConversation reads. Pure. */
export function asConversation(row, r, px, label) {
  return { id: row.bank_id, theme: `${label} — a common question`, turns: [{ turn: 1, move: 'opening question', user: row.q, reply: r.text,
    sources: (r.sources || []).map((s) => ({ title: s.title ?? s.source_title ?? null, author: s.author ?? s.source_author ?? null, url: s.url ?? s.source_url ?? null, text: s.text ?? '', document_id: s.document_id ?? s.doc_id ?? null })),
    citations: r.citations || [], route: { strategy: row.strategy, search_query: null, retrieved: (r.sources || []).length }, perplexity: px }] };
}

/** Per tradition: win/tie/loss, presentation means, missed in-library sources. Pure. */
export function bankRollup(results) {
  const by = {};
  for (const x of results) (by[x.bank_id.replace(/-\d+$/, '')] ||= []).push(x);
  const mean = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null);
  return Object.fromEntries(Object.entries(by).map(([t, g]) => {
    const judged = g.filter((x) => x.judge?.verdict), pr = g.map((x) => x.presentation).filter(Boolean);
    const count = (v) => judged.filter((x) => x.judge.verdict === v).length;
    return [t, {
      n: g.length, judged: judged.length,
      verdicts: { anis_better: count('anis_better'), equal: count('equal'), px_better: count('px_better'), neither: count('neither') },
      presentation: { passage_cards: mean(pr.map((p) => p.passage_cards)), with_passage_card: pr.filter((p) => p.passage_cards > 0).length, with_book_card: pr.filter((p) => p.book_card).length,
        ocean_links: mean(pr.map((p) => p.ocean_links)), ocean_works: mean(pr.map((p) => p.ocean_works)), no_ocean_link: pr.filter((p) => !p.ocean_links).length,
        bad_links: pr.reduce((s, p) => s + p.bad_links, 0), bare_urls: pr.reduce((s, p) => s + p.bare_urls, 0), names_site: pr.filter((p) => p.names_site).length,
        words: mean(pr.map((p) => p.words)), seconds: mean(pr.map((p) => p.seconds).filter((v) => v != null)), px_words: mean(g.filter((x) => x.px?.text).map((x) => x.px.text.split(/\s+/).filter(Boolean).length)) },
      missed_in_library: judged.flatMap((x) => (x.judge.px_only_sources || []).filter((s) => s.in_library === true).map((s) => ({ bank_id: x.bank_id, q: x.q, title: s.title, author: s.author, kind: s.kind, in_anis_sources: s.in_anis_sources, match: s.library_match ? { title: s.library_match.title, document_id: s.library_match.document_id } : null }))),
      collection_gaps: judged.flatMap((x) => (x.judge.px_only_sources || []).filter((s) => s.in_library === false).map((s) => ({ bank_id: x.bank_id, title: s.title, author: s.author }))),
      px_usd: +g.reduce((s, x) => s + (x.px_cost || 0), 0).toFixed(4), judge_usd: +judged.reduce((s, x) => s + (x.judge.cost || 0), 0).toFixed(4),
    }];
  }));
}
