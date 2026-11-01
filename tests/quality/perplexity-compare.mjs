// Perplexity vs Anís, per conversation turn (used by anis-conversations.mjs). Perplexity (sonar) gets the same thread so far
// (reader messages + Anís's earlier replies, links flattened) → its answer + URLs + measured cost; an Opus judge then compares
// how each identified the SOURCE (work, author, location), lists sources only Perplexity named and its errors; each such source
// is checked against OUR library through the public v1 API (X-API-Key TEST_API_KEY: title lookup + raw phrase search, never the DB).
// In library but missed by Anís = a retrieval/selection defect (fixture); absent = a collection gap.
const PPLX_URL = 'https://api.perplexity.ai/chat/completions';
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const plainLinks = (s) => String(s || '').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');

// ---- Perplexity: one call per turn with the thread so far (strict user/assistant alternation, ending with the reader)
const PX_SYSTEM = 'You are answering a reader exploring sacred and scholarly religious texts. Ground every claim in sources. When you quote or paraphrase a text, name the work, its author, and where in it the passage appears (chapter, section, paragraph or number).';
export async function perplexityTurn(transcript, { key = process.env.PERPLEXITY_API_KEY, model = 'sonar', maxTokens = 900 } = {}) {
  const t0 = Date.now();
  if (!key) return { text: '', urls: [], cost: 0, ms: 0, error: 'no PERPLEXITY_API_KEY' };
  const messages = [{ role: 'system', content: PX_SYSTEM }, ...transcript.map((m) => ({ role: m.role, content: m.role === 'user' ? clip(m.content, 3900) : clip(plainLinks(m.content), 3000) }))];
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {   // one retry on a transient failure (network, 429, 5xx)
    try {
      const r = await fetch(PPLX_URL, { method: 'POST', signal: AbortSignal.timeout(90000),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, max_tokens: maxTokens }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { last = `http ${r.status} ${clip(JSON.stringify(j), 160)}`; if ((r.status >= 500 || r.status === 429) && !attempt) { await sleep(2000); continue; } break; }
      const u = j.usage || {};
      // measured: Perplexity returns usage.cost.total_cost (tokens + request fee); fallback = $1/M in+out + $0.005/request (marked)
      const measured = typeof u.cost?.total_cost === 'number';
      const cost = measured ? u.cost.total_cost : ((u.prompt_tokens || 0) + (u.completion_tokens || 0)) / 1e6 + 0.005;
      const urls = (j.search_results || []).map((s) => ({ url: s.url, title: s.title || null }))
        .concat((j.citations || []).filter((x) => typeof x === 'string').map((x) => ({ url: x, title: null })))
        .filter((c, i, a) => c.url && a.findIndex((x) => x.url === c.url) === i);
      return { text: j.choices?.[0]?.message?.content || '', urls, cost: +cost.toFixed(5), cost_measured: measured, ms: Date.now() - t0,
        usage: { prompt_tokens: u.prompt_tokens ?? null, completion_tokens: u.completion_tokens ?? null, search_context_size: u.search_context_size ?? null }, error: null };
    } catch (e) { last = e.message; if (!attempt) { await sleep(2000); continue; } }
  }
  return { text: '', urls: [], cost: 0, ms: Date.now() - t0, error: last };
}

// ---- library check (first-party public API; the key marks these as test traffic)
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘'`ʼʻ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
const titleKey = (s) => fold(s).replace(/^(the|a|an) /, '');
const words = (s) => fold(s).split(' ').filter(Boolean);
function titleMatch(want, got) {
  const a = titleKey(want), b = titleKey(got);
  if (!a || !b) return false;
  if (a === b) return true;
  const wa = a.split(' '), wb = new Set(b.split(' '));
  if (wa.length < 2) return false;
  if ((b.includes(a) || a.includes(b)) && Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.6) return true;
  const inter = wa.filter((w) => wb.has(w)).length;
  return inter / new Set([...wa, ...wb]).size >= 0.75;
}
/** Share of the quote's 5-word runs found in the passage (a paraphrased quote scores low). Pure. */
export function quoteCoverage(quote, text) {
  const q = words(quote), t = ` ${words(text).join(' ')} `;
  if (q.length < 6) return 0;
  const grams = q.slice(0, q.length - 4).map((_, i) => q.slice(i, i + 5).join(' '));
  return grams.filter((g) => t.includes(` ${g} `)).length / grams.length;
}
export async function libraryCheck(src, { api, key = process.env.TEST_API_KEY } = {}) {
  const H = { 'X-API-Key': key, 'content-type': 'application/json' };
  const how = [], errors = [];
  const get = async (path, init) => { const r = await fetch(`${api}${path}`, { ...init, headers: H, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status}`); return r.json(); };
  let found = null;
  // the judge sometimes appends an imprint or a note: "The Hidden Words of Bahá'u'lláh (Wilmette: …, 1985)" → the title alone
  src = { ...src, title: String(src.title || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || src.title };
  if (src.title && words(src.title).length) {
    try {
      const j = await get(`/api/v1/library/find-document?title=${encodeURIComponent(src.title)}&limit=5`);
      const c = (j.candidates || []).find((x) => titleMatch(src.title, x.title));
      how.push(`find-document "${clip(src.title, 60)}" → ${(j.candidates || []).slice(0, 3).map((x) => `${x.title} (${x.document_id})`).join('; ') || 'none'}`);
      if (c) found = { by: 'title', document_id: c.document_id, title: c.title, author: c.author };
    } catch (e) { errors.push(e.message); }
    if (!found) try {
      const j = await get(`/api/v1/library/documents?q=${encodeURIComponent(src.title)}&limit=5`);
      const c = (j.documents || []).find((x) => titleMatch(src.title, x.title));
      how.push(`documents?q → ${(j.documents || []).slice(0, 3).map((x) => `${x.title} (${x.id})`).join('; ') || 'none'}`);
      if (c) found = { by: 'title', document_id: c.id, title: c.title, author: c.author };
    } catch (e) { errors.push(e.message); }
  }
  if (src.quote && words(src.quote).length >= 6) {
    try {
      const j = await get('/api/v1/search', { method: 'POST', body: JSON.stringify({ query: clip(src.quote, 480), limit: 5, analyze: false }) });
      const best = (j.results || []).map((x) => ({ x, cov: quoteCoverage(src.quote, x.text) })).sort((p, q) => q.cov - p.cov)[0];
      how.push(`phrase search → ${best ? `${best.x.title} (${best.x.documentId}) ¶${best.x.paragraphIndex} coverage ${best.cov.toFixed(2)}` : 'no hits'}`);
      if (best && best.cov >= 0.5) found ||= { by: 'quote', document_id: best.x.documentId, title: best.x.title, author: best.x.author, paragraph_index: best.x.paragraphIndex, coverage: +best.cov.toFixed(2) };
      if (best && best.cov >= 0.5 && found.by === 'title') found.quote_in = { title: best.x.title, document_id: best.x.documentId, paragraph_index: best.x.paragraphIndex };
    } catch (e) { errors.push(e.message); }
  }
  const checked = how.length > 0;
  // a letter/talk/tablet named only by description cannot be ruled out by a title lookup: unknown, not a gap
  const describedOnly = ['letter', 'talk', 'tablet', 'website', 'other'].includes(src.kind) && !(src.quote && words(src.quote).length >= 6);
  const in_library = found ? true : (!checked || errors.length || describedOnly) ? 'unknown' : false;
  return { in_library, how_checked: [...how, ...errors.map((e) => `error ${e}`)].join(' | ') || 'nothing checkable (no title or quote)', match: found };
}

// ---- the comparison judge (separate from the conversation judge, whose prompt and scores stay unchanged)
const KINDS = ['book', 'compilation', 'letter', 'talk', 'tablet', 'article', 'website', 'other'];
const IDENT = { type: 'object', required: ['sources', 'correct', 'precision'], properties: {
  sources: { type: 'array', items: { type: 'object', properties: { work: { type: 'string' }, author: { type: 'string' }, location: { type: 'string', description: 'chapter / section / paragraph / number, or ""' } } } },
  correct: { type: 'string', enum: ['yes', 'partly', 'no', 'none_named'] },
  precision: { type: 'string', enum: ['paragraph', 'section', 'work', 'none'] },
  note: { type: 'string' } } };
const COMPARE = { name: 'source_compare', description: 'per-turn source comparison', input_schema: { type: 'object', required: ['anis_identified', 'px_identified', 'winner', 'why', 'px_only_sources', 'px_errors'], properties: {
  anis_identified: IDENT, px_identified: IDENT,
  winner: { type: 'string', enum: ['anis', 'px', 'tie', 'neither'], description: 'who identified the actual source(s) more correctly and precisely; tie = equally good; neither = both failed or no source was at stake' },
  why: { type: 'string' },
  px_only_sources: { type: 'array', description: 'sources (book, compilation, letter, talk, tablet) Perplexity named that bear on the question and Anís did NOT name in his reply', items: { type: 'object', required: ['title', 'kind'], properties: {
    title: { type: 'string', description: 'the work\'s usual published title, e.g. "Some Answered Questions", "Gleanings from the Writings of Bahá\'u\'lláh"; for a letter, its compilation if known' },
    author: { type: 'string' }, kind: { type: 'string', enum: KINDS },
    quote: { type: 'string', description: 'the verbatim words Perplexity quotes from it (6+ words), or ""' },
    location: { type: 'string' },
    in_anis_sources: { type: 'boolean', description: 'is it among the SOURCES SURFACED to Anís (he had it but did not use it)?' },
    relevant: { type: 'string', description: 'why a correct answer should have named it' } } } },
  px_errors: { type: 'array', items: { type: 'object', required: ['kind', 'what', 'anis_got_it_right'], properties: {
    kind: { type: 'string', enum: ['misattribution', 'unofficial_translation', 'pilgrim_note_as_writings', 'authority_error', 'invented_or_misquoted', 'wrong_location', 'factual', 'other'] },
    what: { type: 'string' }, anis_got_it_right: { type: 'boolean' } } } },
  anis_errors: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string' }, what: { type: 'string' } } } } } } };
const SYSTEM = (authority) => `You compare two answers to the same turn of a conversation about sacred and scholarly texts: ANÍS (an AI librarian answering from a large library that includes many copyrighted Bahá'í books; his links point to oceanlibrary.com / siftersearch.com / ctai.info paragraphs) and PERPLEXITY (web search). Focus on SOURCE IDENTIFICATION: for the texts each answer quotes or rests on, did it name the actual work, author and location, correctly? Who was more precise and more correct? Check claims against your own knowledge of the texts; say so when unsure.
${authority}
Judge errors by that order: a pilgrim's note presented as Bahá'u'lláh's or 'Abdu'l-Bahá's written words, an unofficial or provisional translation presented as the authorised one, a UHJ letter treated as doctrine, a scholar's paraphrase presented as scripture, a quotation attributed to the wrong figure or book — each is an error.
List as px_only_sources only real, bearing sources Perplexity named and Anís did not (not websites as such: name the book or letter a web page reproduces). Give the published title as the library would catalogue it, and the quoted words exactly as Perplexity gives them. Do not invent. Call source_compare exactly once.`;

export async function compareTurn({ claude, model, authority, conv, turn }) {
  const earlier = conv.turns.slice(0, turn.turn - 1).map((x) => `READER (T${x.turn}): ${clip(x.user, 400)}\nANÍS (T${x.turn}, abridged): ${clip(plainLinks(x.reply), 600)}`).join('\n');
  const px = turn.perplexity;
  const body = [
    `THEME: ${conv.theme}`, earlier ? `EARLIER IN THE CONVERSATION:\n${earlier}` : '',
    `=== THIS TURN (T${turn.turn}, reader move: ${turn.move}) ===\nREADER: ${turn.user}`,
    `=== ANÍS ===\n${clip(turn.reply, 9000) || '(no reply)'}`,
    `ANÍS — SOURCES SURFACED BY HIS RETRIEVAL (${turn.sources.length}):\n${turn.sources.map((s, i) => `  ${i + 1}. ${s.author || '?'} — ${s.title || '?'} ${s.url || ''}\n     "${clip(s.text, 200)}"`).join('\n') || '  (none)'}`,
    turn.citations?.length ? `ANÍS — CITATIONS IN HIS REPLY:\n${turn.citations.map((c) => `  - ${c.title || c.source_title || '?'} ${c.url || c.citation_url || ''}`).join('\n')}` : '',
    `ANÍS — ROUTE: strategy ${turn.route?.strategy ?? '?'}, search_query ${JSON.stringify(turn.route?.search_query ?? null)}, retrieved ${turn.route?.retrieved ?? '?'}`,
    `=== PERPLEXITY ===\n${clip(px.text, 9000)}`,
    `PERPLEXITY — URLS:\n${px.urls.map((u, i) => `  [${i + 1}] ${u.title ? `${u.title} — ` : ''}${u.url}`).join('\n') || '  (none)'}`,
  ].filter(Boolean).join('\n\n');
  const res = await claude().messages.create({ model, max_tokens: 4000, system: SYSTEM(authority), tools: [COMPARE], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `${body}\n\nCompare the two answers' sources and call source_compare.` }] });
  const v = res.content.find((b) => b.type === 'tool_use')?.input;
  if (!v) throw new Error('compare judge returned no verdict');
  return { verdict: v, usage: res.usage };
}

/** Compare every turn that has a Perplexity answer; fills turn.source_compare (and in_library per Perplexity-only source). */
export async function compareConversation(conv, { claude, model, usd, api, authority, concurrency = 3, onCost = () => {} }) {
  const todo = conv.turns.filter((t) => t.perplexity?.text && t.reply);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (i < todo.length) {
      const t = todo[i++];
      try {
        const { verdict: v, usage } = await compareTurn({ claude, model, authority, conv, turn: t });
        const cost = usd(model, usage); onCost(cost);
        const surfaced = (title) => t.sources.some((s) => titleMatch(title, String(s.title || '').replace(/\s+\d+$/, '')));
        const px_only_sources = await Promise.all((v.px_only_sources || []).map(async (s) => {
          const chk = await libraryCheck(s, { api }).catch((e) => ({ in_library: 'unknown', how_checked: `error ${e.message}`, match: null }));
          return { title: s.title, author: s.author || null, kind: s.kind, quote: s.quote || '', location: s.location || '', relevant: s.relevant || '',
            in_anis_sources: !!(s.in_anis_sources || surfaced(s.title) || (chk.match && t.sources.some((x) => x.document_id && x.document_id === chk.match.document_id))),
            in_library: chk.in_library, how_checked: chk.how_checked, library_match: chk.match };
        }));
        t.source_compare = { anis_identified: v.anis_identified, px_identified: v.px_identified, winner: v.winner, why: v.why, px_only_sources,
          px_errors: v.px_errors || [], anis_errors: v.anis_errors || [], cost: +cost.toFixed(5) };
      } catch (e) { t.source_compare = { error: e.message }; }
    }
  }));
}

/** "Missed but in library" → fixtures in the harness's defect-fixture shape (stage selection when Anís's retrieval surfaced it). */
export function pxFixtures(conv) {
  const out = [];
  for (const t of conv.turns) for (const s of t.source_compare?.px_only_sources || []) {
    if (s.in_library !== true) continue;
    const msgs = conv.turns.slice(0, t.turn).flatMap((x, i) => (i < t.turn - 1 ? [{ role: 'user', content: x.user }, { role: 'assistant', content: x.reply }] : [{ role: 'user', content: x.user }]));
    const m = s.library_match || {};
    out.push({ conversation: conv.id, turn: t.turn, move: t.move, stage: s.in_anis_sources ? 'selection' : 'retrieval', severity: 'major', origin: 'perplexity-compare',
      what: `Perplexity named ${s.title}${s.author ? ` (${s.author})` : ''}${s.location ? `, ${s.location}` : ''} and the library holds it (${m.title || '?'}, doc ${m.document_id ?? '?'}${m.paragraph_index != null ? ` ¶${m.paragraph_index}` : ''}); Anís did not name it`,
      expected: `the reply identifies ${s.title}${s.location ? ` (${s.location})` : ''}${s.quote ? ` and quotes "${clip(s.quote, 200)}"` : ''} from the library's copy, linked to its paragraph${s.relevant ? ` — ${s.relevant}` : ''}`,
      route: t.route ? { strategy: t.route.strategy, search_query: t.route.search_query, history_turns: t.route.history_turns } : null, messages: msgs });
  }
  return out;
}

const WINNERS = ['anis', 'px', 'tie', 'neither'];
/** Per-conversation (and, over all, per-run) roll-up. Pure. */
export function pxRollup(results) {
  const turns = results.flatMap((r) => r.turns.map((t) => ({ r, t })));
  const cmp = turns.filter(({ t }) => t.source_compare && !t.source_compare.error);
  const srcs = cmp.flatMap(({ r, t }) => t.source_compare.px_only_sources.map((s) => ({ conversation: r.id, turn: t.turn, title: s.title, author: s.author, kind: s.kind, in_library: s.in_library, in_anis_sources: s.in_anis_sources, how_checked: s.how_checked, match: s.library_match ? { title: s.library_match.title, document_id: s.library_match.document_id, by: s.library_match.by } : null })));
  const pxT = turns.filter(({ t }) => t.perplexity && !t.perplexity.error);
  const cost = pxT.reduce((a, { t }) => a + (t.perplexity.cost || 0), 0), ccost = cmp.reduce((a, { t }) => a + (t.source_compare.cost || 0), 0);
  return {
    turns_with_px: pxT.length, px_errors_http: turns.filter(({ t }) => t.perplexity?.error).length, compared: cmp.length, compare_failed: turns.filter(({ t }) => t.source_compare?.error).length,
    winners: Object.fromEntries(WINNERS.map((w) => [w, cmp.filter(({ t }) => t.source_compare.winner === w).length])),
    missed_in_library: srcs.filter((s) => s.in_library === true), collection_gaps: srcs.filter((s) => s.in_library === false), unknown: srcs.filter((s) => s.in_library === 'unknown'),
    px_errors: cmp.flatMap(({ r, t }) => t.source_compare.px_errors.map((e) => ({ conversation: r.id, turn: t.turn, ...e }))),
    px_ms_p50: (() => { const a = pxT.map(({ t }) => t.perplexity.ms).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; })(),
    usd: { perplexity: +cost.toFixed(4), compare_judge: +ccost.toFixed(4), per_turn_perplexity: pxT.length ? +(cost / pxT.length).toFixed(5) : null, per_turn_compare: cmp.length ? +(ccost / cmp.length).toFixed(5) : null },
  };
}

export function pxMarkdown(results) {
  const all = pxRollup(results);
  if (!all.turns_with_px && !all.compared) return '';
  const w = all.winners, L = ['## Perplexity comparison (sources)', '',
    `${all.compared} turns compared (${all.turns_with_px} Perplexity answers, ${all.px_errors_http} Perplexity failures, ${all.compare_failed} judge failures). Winner: Anís ${w.anis} · Perplexity ${w.px} · tie ${w.tie} · neither ${w.neither}.`,
    `Cost: Perplexity $${all.usd.perplexity} ($${all.usd.per_turn_perplexity}/turn, p50 ${all.px_ms_p50 ?? '-'} ms), comparison judge $${all.usd.compare_judge} ($${all.usd.per_turn_compare}/turn).`, ''];
  const row = (s) => `- ${s.conversation} T${s.turn}: **${s.title}**${s.author ? ` (${s.author})` : ''} [${s.kind}]${s.match ? ` → ${s.match.title} (doc ${s.match.document_id}, by ${s.match.by})` : ''}${s.in_anis_sources ? ' — was in Anís\'s sources' : ''}\n  - checked: ${s.how_checked}`;
  L.push(`### Missed but in the library (${all.missed_in_library.length}) — Anís retrieval/selection defects`, '', ...(all.missed_in_library.map(row).length ? all.missed_in_library.map(row) : ['none']), '');
  L.push(`### Collection gaps (${all.collection_gaps.length}) — Perplexity named, library lacks`, '', ...(all.collection_gaps.map(row).length ? all.collection_gaps.map(row) : ['none']), '');
  if (all.unknown.length) L.push(`### Not determinable (${all.unknown.length})`, '', ...all.unknown.map(row), '');
  L.push(`### Perplexity errors (${all.px_errors.length})`, '', ...(all.px_errors.length ? all.px_errors.map((e) => `- ${e.conversation} T${e.turn} [${e.kind}]${e.anis_got_it_right ? ' (Anís right)' : ''}: ${e.what}`) : ['none']), '');
  for (const r of results) {
    const ts = r.turns.filter((t) => t.source_compare && !t.source_compare.error);
    if (!ts.length) continue;
    L.push(`#### ${r.id}`, '', ...ts.map((t) => `- T${t.turn} *${t.move}*: **${t.source_compare.winner}** — ${t.source_compare.why}${t.perplexity ? ` (Perplexity ${(t.perplexity.ms / 1000).toFixed(1)} s, $${t.perplexity.cost})` : ''}`), '');
  }
  return L.join('\n');
}
