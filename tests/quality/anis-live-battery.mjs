#!/usr/bin/env node
// Live Anís battery: real questions → /api/chat/stream (as the widget calls it), timed per event, checked in CODE (no LLM judge, $0 beyond Anís itself):
// capability denial, leaked markers, malformed markdown, empty/error, expected book card / cited work, latency targets. Replies saved for hand review.
//   node tests/quality/anis-live-battery.mjs [--only id,id] [--concurrency 3]   API_BASE (default https://api.siftersearch.com)
import { writeFileSync, mkdirSync } from 'fs';
import net from 'net';
// a slow home link: Node's 250 ms per-address connect race gave "fetch failed" (ETIMEDOUT on every Cloudflare IP) while curl got through
net.setDefaultAutoSelectFamilyAttemptTimeout(3000);
import { isSearchDenial } from '../../api/lib/assistant/lint.js';
import { markdownDefects } from '../../api/lib/assistant/md-valid.js';

const API = (process.env.API_BASE || 'https://api.siftersearch.com').replace(/\/$/, '');
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
// book: the card's title must match; cite: some citation/source title must match; ms: total budget; card_ms: book card budget
export const CASES = [
  { id: 'gita', q: 'Gita', book: /bhagavad|gita/i, card_ms: 3000 },
  { id: 'iqan', q: 'Iqan', book: /[ií]q[aá]n|certitude/i, card_ms: 3000 },
  { id: 'matthew', q: 'Matthew', book: /matthew/i, card_ms: 3000 },
  { id: 'dispensation', q: "Dispensation of Baha'u'llah", book: /dispensation/i, card_ms: 3000 },
  { id: 'deepening-rd', q: 'do you have the research department compilation on Deepening', book: /deepening/i, card_ms: 4000 },
  { id: 'deepening-comp', q: 'Deepening Compilation', book: /deepening/i, card_ms: 4000 },
  { id: 'hindus', q: 'Do you have access to the main book of the Hindus?', book: /gita|veda|upanishad/i, card_ms: 6000 },
  { id: 'dawnbreakers', q: 'The Dawn-Breakers', book: /dawn.?breakers/i, card_ms: 3000 },
  { id: 'hidden-words', q: 'Hidden Words', book: /hidden words/i, card_ms: 3000 },
  { id: 'tao', q: 'Tao Te Ching', book: /tao te ching/i, card_ms: 3000 },
  { id: 'quran', q: "Do you have the Qur'an?", book: /qur.?[aá]n|koran/i, card_ms: 4000 },
  { id: 'find-gpb', q: 'can you search for "private property" in God Passes By?', text: /private property/i, cite: /god passes by/i, ms: 6000, phrase: 'private property' },
  // Chad 11-10: the card's offer answered with words to find → only the reference, no discussion
  { id: 'find-gpb-thread', before: ['God Passes By'], q: 'yes, can you search it for "private property"?', text: /private property/i, cite: /god passes by/i, ms: 6000, phrase: 'private property', only: true },
  { id: 'find-gleanings', q: 'where in Gleanings does it say "ray of the sun"?', cite: /gleanings/i, ms: 8000 },
  { id: 'find-dhammapada', q: 'find "hatred ceases" in the Dhammapada', text: /hatred/i, cite: /dhammapada/i, ms: 8000 },
  { id: 'prayer-healing', q: 'a prayer for healing', ms: 15000 },
  { id: 'prayer-christian', q: 'a Christian prayer for forgiveness', cite: /./, ms: 15000 },
  { id: 'justice', q: "What does Bahá'u'lláh say about justice?", cite: /./, ms: 30000 },
  { id: 'sikh-humility', q: 'What does Sikh scripture say about humility?', cite: /granth|guru|sikh|japji/i, ms: 30000 },
  { id: 'afterlife', q: 'How do the religions view life after death?', cite: /./, ms: 40000 },
  { id: 'tahirih', q: 'Who was Táhirih?', text: /t[aá]hirih/i, ms: 25000 },
  { id: 'aqdas', q: 'What is the Kitáb-i-Aqdas?', text: /aqdas/i, ms: 20000 },
  { id: 'one-country', q: 'Is "the earth is but one country" a quotation?', text: /bah[aá].u.ll[aá]h/i, ms: 15000 },
  { id: 'bab-born', q: 'When was the Báb born?', text: /1819/, ms: 20000 },
  { id: 'hi', q: 'hi', ms: 4000 },
];

async function turn(q, { before = [] } = {}) {
  // a case with `before` is a thread: those turns first (same reader, same conversation), the last one measured
  const uid = `user_${crypto.randomUUID()}`, messages = []; let cid = null;
  for (const p of before) { const r = await send(p, messages, uid, cid); cid = r.cid; messages.push({ role: 'user', content: p }, { role: 'assistant', content: r.text }); }
  return send(q, messages, uid, cid);
}

async function send(q, history, uid, cid) {
  const t0 = Date.now(), at = {};
  const out = { text: '', chunks: '', events: {}, book: null, sources: [], citations: [], error: null, cid };
  try {
    const r = await fetch(`${API}/api/chat/stream`, { method: 'POST', signal: AbortSignal.timeout(180000),
      headers: { 'content-type': 'application/json', 'x-user-id': uid, 'x-sifter-test': '1' },
      body: JSON.stringify({ messages: [...history, { role: 'user', content: q }], ...(cid ? { conversationId: cid } : {}) }) });
    if (!r.ok) return { ...out, error: `http ${r.status}`, ms: Date.now() - t0, at };
    const dec = new TextDecoder(); let buf = '';
    for await (const part of r.body) {
      buf += dec.decode(part, { stream: true });
      let k; while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k).replace(/^data: /, ''); buf = buf.slice(k + 2);
        let e; try { e = JSON.parse(line); } catch { continue; }
        at[e.type] ??= Date.now() - t0; out.events[e.type] = (out.events[e.type] || 0) + 1;
        if (e.type === 'chunk') out.chunks += e.text || '';
        else if (e.type === 'text') out.text += e.content || '';   // the live stream; the chunk replay at the end is the canonical reply (SifterChat.svelte)
        else if (e.type === 'book') out.book = e.book;
        else if (e.type === 'sources') out.sources = e.sources?.length ? e.sources : out.sources;
        else if (e.type === 'citations') out.citations = e.citations || [];
        else if (e.type === 'complete') { out.complete = e.meta || {}; out.cid = e.meta?.conversation_id || out.cid; }
        else if (e.type === 'session') out.cid = e.conversation_id || out.cid;
        else if (e.type === 'error') out.error = e.message || 'stream error';
      }
    }
  } catch (e) { out.error = e.message; }
  return { ...out, text: (out.chunks || out.text).trim(), ms: Date.now() - t0, at };
}

export function check(c, r) {
  const f = [];
  if (r.error) f.push(`error: ${r.error}`);
  if (!r.text && !r.book) f.push('empty reply');
  const sentences = r.text.split(/(?<=[.!?])\s+/);
  const denial = sentences.find((s) => isSearchDenial(s));
  if (denial) f.push(`search denial: "${denial.slice(0, 100)}"`);
  if (/\[linked|\[own\]|\(P\d+\)|\{\{|undefined|\[object Object\]/.test(r.text)) f.push('leaked marker');
  const md = markdownDefects(r.text); if (md?.length) f.push(`markdown: ${md.map((d) => `${d.id} «${d.at}»`).join(', ')}`);
  // a quoted passage linked to a whole book, not its place (oceanlibrary passage links carry ?paraId=)
  const placeless = [...r.text.matchAll(/\[\*?["“][^\]]{20,}\]\((https:\/\/oceanlibrary\.com\/[^)?#]+)\)/g)].length;
  if (placeless) f.push(`${placeless} quote link(s) without a place`);
  // sending the reader away to ask again is a denial in other words
  if (/\b(?:you (?:might|could|may) (?:try|want to try) (?:asking|searching)|try asking (?:me )?(?:for|to))\b/i.test(r.text)) f.push('tells the reader to ask again');
  // a find's link highlights the words found, not the whole paragraph (Chad 11-10)
  if (c.phrase) for (const m of r.text.matchAll(/selectionString=([^)\s&#]+)/g)) {
    const [a, b] = decodeURIComponent(m[1]).split('~').map((x) => Number(x.split('.').pop()));
    if (b - a > c.phrase.replace(/\s/g, '').length + 4) { f.push('link highlights the paragraph, not the phrase'); break; }
  }
  if (/\blibrary holds nothing\b|\bdidn.t find a passage\b/i.test(r.text) && (c.cite || c.text)) f.push('claims absence');
  if (c.book) { if (!r.book) f.push('no book card'); else if (!c.book.test(`${r.book.title} ${r.book.section ?? ''}`)) f.push(`wrong book: ${r.book.title}`); }
  if (c.book && c.card_ms && r.at.book > c.card_ms) f.push(`card slow ${r.at.book} ms > ${c.card_ms}`);
  const titles = [...r.citations, ...r.sources].map((x) => `${x.title ?? ''} ${x.author ?? ''}`).join(' | ');
  if (c.cite && !c.cite.test(titles)) f.push(`no expected citation (${titles.slice(0, 80) || 'none'})`);
  if (c.text && !c.text.test(r.text)) f.push('expected words missing');
  // a find that found: the count line and the places, nothing after (Chad 11-10: "leave it at that if found")
  if (c.only && r.text.split(/\n+/).some((l, i) => i > 0 && l.trim() && !/^\s*[-*\d]/.test(l))) f.push('discusses beyond the reference');
  if (c.ms && r.ms > c.ms) f.push(`slow ${r.ms} ms > ${c.ms}`);
  return f;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = arg('only')?.split(','), conc = Number(arg('concurrency') || 3);
  const cases = CASES.filter((c) => !only || only.includes(c.id));
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < cases.length) { const c = cases[i++]; const r = await turn(c.q, c); res.push({ c, r, f: check(c, r) }); } }));
  res.sort((a, b) => cases.indexOf(a.c) - cases.indexOf(b.c));
  for (const { c, r, f } of res) {
    const first = Math.min(...['book', 'chunk', 'text'].map((k) => r.at[k] ?? Infinity));
    console.log(`${f.length ? 'FAIL' : 'ok  '} ${c.id.padEnd(16)} total ${String(r.ms).padStart(6)} ms  first ${String(Number.isFinite(first) ? first : '-').padStart(6)}${r.book ? `  card ${r.book.title.slice(0, 40)}` : ''}${f.length ? `\n      ${f.join('\n      ')}` : ''}`);
  }
  const n = res.filter((x) => !x.f.length).length;
  console.log(`\n${n}/${res.length} pass`);
  mkdirSync('tmp', { recursive: true });
  const file = `tmp/anis-live-battery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(res.map(({ c, r, f }) => ({ id: c.id, q: c.q, fails: f, ms: r.ms, at: r.at, book: r.book, text: r.text, cites: r.citations.map((x) => x.title) })), null, 1));
  console.log(`replies: ${file}`);
}
