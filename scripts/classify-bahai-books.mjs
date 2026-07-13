#!/usr/bin/env node
// classify-bahai-books — content-SAMPLE genre classification of the 'Baha'i Books' collection, to fill the
// biography popup's Biographies + General Histories phases. Reads a body sample of each book (NOT the blurb —
// descriptions mislead) and classifies genre via deepseek-v4-flash; KEEPS only history + biography.
// Prints the catalog JSON to stdout: { generatedAt, source, counts, books:[{id,genre,title}] }. Logs to stderr.
//   node scripts/classify-bahai-books.mjs > api/lib/bahai-history-catalog.json   (run where the DB + key live)
import dotenv from 'dotenv'; dotenv.config({ path: '.env-secrets' }); dotenv.config({ path: '.env-public' });
import { queryAll } from '../api/lib/db.js';
import { chatCompletion } from '../api/lib/ai.js';

const err = (...a) => console.error(...a);
const books = await queryAll(`SELECT id, title, author, paragraph_count FROM docs
  WHERE collection='Baha''i Books' AND deleted_at IS NULL AND duplicate_of IS NULL
    AND religion LIKE 'Baha%' AND paragraph_count >= 40 ORDER BY id`);
err(`classifying ${books.length} Baha'i Books by content sample…`);

// Body sample: up to 5 substantive paragraphs from ~20% in (skips title page / TOC / front matter).
async function sample(b) {
  const off = Math.max(0, Math.floor((b.paragraph_count || 0) * 0.2));
  const rows = await queryAll(`SELECT text FROM content WHERE doc_id=? AND deleted_at IS NULL AND length(text)>100
    ORDER BY paragraph_index LIMIT 5 OFFSET ?`, [b.id, off]);
  return rows.map((r) => r.text).join(' ').replace(/\s+/g, ' ').slice(0, 800);
}

const SYS = `You classify Bahá'í books by GENRE from a sample of the book's ACTUAL TEXT. Judge by the sample, never the title alone. Genres:
- "biography": centered on the life(s) of specific named person(s) — memoirs, autobiographies, life-stories, or collective lives of believers/martyrs/Hands of the Cause.
- "history": a narrative account of events, a community, a locality, an episode, or a period (general history, regional/national community history, chronicles, travelogues that narrate events).
- "topical": thematic, introductory, comparative, or apologetic works ABOUT a subject (comparative religion, law, ethics, philosophy, science-and-religion, "introduction to…", teachings-about).
- "doctrinal": scripture exposition, commentary, or theology.
- "scripture": revealed text, tablets, or prayers.
- "reference": catalog, bibliography, index, dictionary, or statistical compilation.
- "other": anything else.
Return ONLY JSON: {"items":[{"id":<number>,"genre":"<one genre>"}]} for every id given.`;

const CHUNK = 14, out = [], tally = {};
for (let i = 0; i < books.length; i += CHUNK) {
  const batch = books.slice(i, i + CHUNK);
  const samples = await Promise.all(batch.map(sample));
  const user = batch.map((b, j) => `id=${b.id} | "${b.title}" — ${b.author || '?'}\nSAMPLE: ${samples[j] || '(no body text)'}`).join('\n\n');
  let items = [];
  for (let attempt = 0; attempt < 3 && !items.length; attempt++) {
    try {
      const res = await chatCompletion([{ role: 'system', content: SYS }, { role: 'user', content: user }],
        { provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, maxTokens: 1500, responseFormat: { type: 'json_object' } });
      items = JSON.parse((res.content || '').match(/\{[\s\S]*\}/)[0]).items || [];
    } catch (e) { err(`  batch@${i} attempt ${attempt + 1}: ${e.message}`); }
  }
  const genreById = Object.fromEntries(items.map((x) => [Number(x.id), String(x.genre || 'other')]));
  for (const b of batch) {
    const g = genreById[b.id] || 'other'; tally[g] = (tally[g] || 0) + 1;
    if (g === 'history' || g === 'biography') out.push({ id: b.id, genre: g, title: b.title });
  }
  err(`  ${Math.min(i + CHUNK, books.length)}/${books.length} · kept ${out.length}`);
}
out.sort((a, b) => a.genre.localeCompare(b.genre) || a.id - b.id);
// Write to the file directly (NOT stdout — the shared DB logger prints to stdout and would corrupt it).
// Path is cwd-relative; always run from the repo root.
const OUT = process.env.CATALOG_OUT || 'api/lib/bahai-history-catalog.json';
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(),
  source: "Baha'i Books collection, content-sample classified (deepseek-v4-flash)", counts: tally, books: out }));
err(`done: wrote ${OUT} — kept ${out.length} history/biography of ${books.length}. tally=${JSON.stringify(tally)}`);
process.exit(0);
