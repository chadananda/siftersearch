// Implication browser logic over implied-repo: item shaping (contract Item), semantic search/similar (Qdrant `hype`), the first-principles graph,
// run-file import, the single-paragraph propose call (the only LLM spend; injectable), reindex queueing. No SQL here. Deps: implied-repo, source-links, qdrant-layers.
import fs from 'node:fs';
import path from 'node:path';
import * as repo from '../repos/implied-repo.js';
import * as scores from '../repos/question-score-repo.js';
import { readerUrl } from '../source-links.js';

const SIMILAR_MIN = 0.8;
const fold = (q) => String(q ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

/** repo item (+doc) → the contract Item. paragraph = { text, index, prev?, next? } when given. */
export const shapeItem = (r, paragraph = null) => r && ({
  id: r.id, paraId: r.paraId, docId: r.docId, question: r.question, premise: r.premise, implies: r.implies, proof: r.proof, concept: r.concept, status: r.status,
  source: r.source, model: r.model, updatedAt: r.updatedAt, note: r.note,
  doc: { title: r.doc?.title ?? null, author: r.doc?.author ?? null, religion: r.doc?.religion ?? null, collection: r.doc?.collection ?? null },
  ...(paragraph ? { paragraph } : {}),
  link: readerUrl({ doc_id: r.docId, slug: r.doc?.slug, religion: r.doc?.religion, collection: r.doc?.collection }, paragraph?.index ?? r.paragraphIndex ?? null),
});

/** One batch lookup of this rater's scores → fn(paraId, question) → 1-5 | null. */
async function scorer(pairs, rater) {
  const m = await scores.scoresFor(pairs, rater || '');
  return (paraId, question) => m.get(scores.keyOf(paraId, question))?.score ?? null;
}

/** Queue the vectors to follow an edit (dedupe is in enqueue). → 'queued' | 'none' | 'off' */
export async function queueReindex(docIds, deps = {}) {
  const ids = [...new Set((docIds || []).filter(Boolean))];
  if (!ids.length) return 'none';
  const q = await (deps.queueFollowIndex || (await import('../ops/index-follow.js')).queueFollowIndex)('hype', ids, 'implied-edit');
  return q?.queued ? 'queued' : q?.off ? 'off' : 'none';
}

/** One item with its paragraph (+ prev/next) and the edit history. */
export async function itemDetail(id, rater) {
  const [row] = await repo.itemsByIds([id]);
  if (!row) return null;
  const pv = await repo.paragraphView(row.paraId), mine = await scorer([{ paraId: row.paraId, question: row.question }], rater);
  return { ...shapeItem(row, pv && { text: pv.text, index: pv.index, prev: pv.prev, next: pv.next }), myScore: mine(row.paraId, row.question), edits: await repo.editsOf(id) };
}

/** List page → { items, next }. */
export async function listItems(q) {
  const { rows, next } = await repo.listImplied(q);
  const mine = await scorer(rows.map((r) => ({ paraId: r.paraId, question: r.question })), q.rater);
  return { items: rows.map((r) => ({ ...shapeItem(r), myScore: mine(r.paraId, r.question) })), next };
}

/** Qdrant hits [{ paragraph_id, doc_id, score, k, implied }] → search hits (implied items from premise_claims; stated from hyp_questions). */
async function hydrateHits(hits, { status, religion } = {}) {
  const imp = await repo.itemsAtHits(hits.filter((h) => h.implied).map((h) => ({ paraId: h.paragraph_id, k: h.k })));
  const statedHits = hits.filter((h) => !h.implied && !h.thesis), raw = await repo.hypRaw(statedHits.map((h) => h.paragraph_id));
  const { parseStoredHypItems } = await import('../search/hype.js');
  const out = [];
  for (const h of hits) {
    if (h.implied) {
      const it = imp.get(`${h.paragraph_id}:${h.k}`);
      if (it && (!status || String(status).split(',').includes(it.status)) && (!religion || it.doc.religion === religion)) out.push({ score: h.score, kind: 'implied', item: shapeItem(it) });
    } else if (!h.thesis) {
      const r = raw.get(h.paragraph_id), s = r && parseStoredHypItems(r.hyp_questions, { slots: true }).filter((i) => !i.implied)[h.k];
      if (s) out.push({ score: h.score, kind: 'stated', stated: { q: s.q, paraId: h.paragraph_id, docId: h.doc_id, doc: { title: r.d_title, author: r.d_author, religion: r.d_religion, collection: r.d_collection },
        link: readerUrl({ doc_id: h.doc_id, slug: r.d_slug, religion: r.d_religion, collection: r.d_collection }, r.paragraph_index) } });
    }
  }
  return out;
}

/** Semantic search of the `hype` collection (implied points only unless stated). → { hits } */
export async function searchHits({ q, limit = 30, status, religion, stated = false, rater }, deps = {}) {
  const search = deps.search || (await import('../search/qdrant-layers.js')).searchHypeQdrant;
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const { hits } = await search(String(q), { limit: lim, filters: { ...(stated ? {} : { implied: true }), ...(religion ? { religion } : {}) } });
  const out = await hydrateHits(hits, { status, religion });
  const pairs = out.map((h) => (h.kind === 'stated' ? { paraId: h.stated.paraId, question: h.stated.q } : { paraId: h.item.paraId, question: h.item.question })), mine = await scorer(pairs, rater);
  return { hits: out.map((h, i) => ({ ...h, myScore: mine(pairs[i].paraId, pairs[i].question) })) };
}

/** Neighbours of an item's own question (its vector = its text embedded the same way). → { hits: [{ score, item }] } */
export async function similarTo(id, { limit = 20 } = {}, deps = {}) {
  const [row] = await repo.itemsByIds([id]);
  if (!row) return null;
  const { hits } = await searchHits({ q: row.question, limit: limit + 1 }, deps);
  return { hits: hits.filter((h) => h.item && h.item.id !== row.id).slice(0, limit).map((h) => ({ score: h.score, item: h.item })) };
}

/** Pure: items [+ root neighbours] → { nodes, links } concept → question → passage ← author. */
export function buildGraph(rows, { rootId = null, similar = [] } = {}) {
  const nodes = new Map(), links = [], seen = new Set();
  const node = (id, n) => { const e = nodes.get(id); if (e) { e.weight += 1; return e; } const x = { id, weight: 1, ...n }; nodes.set(id, x); return x; };
  const link = (source, target, type, weight = 1) => { const k = `${source}|${target}|${type}`; if (seen.has(k)) return; seen.add(k); links.push({ source, target, type, weight }); };
  for (const r of rows) {
    const qid = `q${r.id}`, pid = `p${r.paraId}`, rel = r.doc?.religion || undefined;
    node(qid, { type: 'question', label: r.question, status: r.status, religion: rel }).weight = r.status === 'approved' || r.status === 'edited' ? 3 : 2;
    node(pid, { type: 'passage', label: `${r.doc?.title || 'Passage'} ¶${r.paragraphIndex ?? ''}`.trim(), religion: rel });
    link(qid, pid, 'answeredBy');
    if (r.concept) { node(`c:${r.concept}`, { type: 'concept', label: r.concept }); link(`c:${r.concept}`, qid, 'about'); }
    if (r.doc?.author) { node(`a:${r.doc.author}`, { type: 'author', label: r.doc.author, religion: rel }); link(`a:${r.doc.author}`, pid, 'wrote'); }
  }
  for (const s of similar) if (rootId && nodes.has(`q${s.id}`) && s.id !== rootId && s.score >= SIMILAR_MIN) link(`q${rootId}`, `q${s.id}`, 'similar', Math.round(s.score * 100) / 100);
  return { nodes: [...nodes.values()], links };
}

/** Graph for a concept / religion / root (root adds its Qdrant neighbours ≥ 0.80). */
export async function graph({ concept, religion, root, limit = 150 } = {}, deps = {}) {
  const rootId = root ? Number(root) : null;
  let rows = await repo.graphRows({ concept, religion, rootId, limit });
  let similar = [];
  if (rootId) {
    const s = await similarTo(rootId, { limit: 20 }, deps).catch(() => null);
    similar = (s?.hits || []).map((h) => ({ id: h.item.id, score: h.score })).filter((h) => h.score >= SIMILAR_MIN);
    const have = new Set(rows.map((r) => r.id)), more = similar.map((h) => h.id).filter((i) => !have.has(i));
    if (more.length) rows = [...rows, ...(await repo.itemsByIds(more))];
  }
  return buildGraph(rows, { rootId, similar });
}

/** A paragraph for the HyPE editor: text, doc, stated, implied items, thesis. */
export async function paragraphEditor(paraId, rater) {
  const pv = await repo.paragraphView(paraId);
  if (!pv) return null;
  const { splitHyp } = repo, h = splitHyp(pv.hypQuestions), mine = await scorer([{ paraId: pv.id, question: '' }], rater);
  const stated = h.stated.map((x) => (typeof x === 'string' ? { q: x, a: '', deep: false, seeker: false } : { q: x.q ?? x.question ?? '', a: x.a ?? '', deep: !!x.deep, seeker: !!x.seeker })).filter((x) => x.q).map((x) => ({ ...x, myScore: mine(pv.id, x.q) }));
  const shape = (r) => ({ ...shapeItem({ ...r, doc: pv.doc, paragraphIndex: pv.index }), myScore: mine(pv.id, r.question) });
  return { paragraph: { id: pv.id, text: pv.text, index: pv.index, original: pv.original, prev: pv.prev, next: pv.next }, doc: pv.doc, stated, implied: pv.rows.map(shape), thesis: pv.thesis, hypeVersion: pv.hypeVersion };
}

/** Proof gate for create/patch: words must be in the paragraph (or its original). → null when ok, else the reason. */
export async function proofFault(paraId, proof) {
  const texts = await repo.proofTexts(paraId);
  if (!texts) return 'paragraph not found';
  const { spanPresent } = await import('../rag/enrich/retrieval.js');
  return spanPresent(proof, texts) === true ? null : 'proof words are not in the paragraph (or too short to check)';
}

/** The HyPE implied generation for ONE paragraph → proposals saved as status 'proposed'. deps.ask(messages) → { content, usage } is injectable (tests). → { items, usd } */
export async function propose(paraId, deps = {}) {
  const pv = await repo.paragraphView(paraId);
  if (!pv) return null;
  const R = await import('../rag/enrich/retrieval.js');
  const meta = { title: pv.doc.title, author: pv.doc.author, religion: pv.doc.religion, collection: pv.doc.collection };
  const p = { pid: pv.id, text: pv.text, original: pv.original, heading: null, context: null };
  const { detectProfile } = await import('../pipeline/profile.js'), profile = detectProfile({ id: pv.docId, ...meta }, pv.text);
  let ask = deps.ask, usd = 0;
  if (!ask) {
    const { chatCompletion } = await import('../ai.js'), { withAIContext } = await import('../ai-context.js'), { calculateCost } = await import('../model-registry.js');
    ask = (messages) => withAIContext({ billTo: 'implied-admin', stage: 'hype', caller: 'implied-admin', docId: pv.docId }, () => chatCompletion(messages, { provider: profile.providers.hype, model: profile.models.hype, temperature: 0.3, maxTokens: 8000, caller: 'implied-admin', usePromptCache: true }))
      .then((res) => { usd = calculateCost(profile.models.hype, res?.usage?.promptTokens || 0, res?.usage?.completionTokens || 0); return res; });
  }
  const res = await ask([{ role: 'system', content: R.buildSystem(profile, meta, '') }, { role: 'user', content: R.buildUser(p) }]), raw = res?.content ?? res, parsed = R.parseHype(raw) || { implied: R.parseImplied((() => { try { return JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] ?? '{}').implied; } catch { return []; } })()) };   // implied-only answers have no stated items
  if (deps.usd != null) usd = deps.usd;
  const texts = [pv.text, pv.original].filter(Boolean), held = new Set(pv.rows.filter((r) => r.status !== 'rejected').map((r) => fold(r.question))), good = [];
  for (const it of parsed?.implied || []) {
    if (good.length >= R.MAX_IMPLIED || held.has(fold(it.q)) || R.questionFault(it.q, meta.title, { seeker: true }) || R.spanPresent(it.proof, texts) !== true) continue;
    good.push(it);
  }
  const saved = [];
  for (const it of good) { const r = await repo.createImplied(paraId, { question: it.q, premise: it.premise, implies: it.implies, proof: it.proof, concept: it.concept, status: 'proposed', source: 'hype', model: deps.model || profile.models?.hype || null }, { editor: 'implied-admin' }); if (r?.item) saved.push(r.item); }
  return { items: (await repo.itemsByIds(saved.map((s) => s.id))).map((r) => shapeItem(r)), usd: Math.round(usd * 10000) / 10000 };
}

/** Import a premise-reconcile (or pilot) run file from data/run: keep | rescope → newPremise | move → movedTo; each of its questions becomes an item; drop/skipped/unjudged skipped.
 *  Source 'pilot', status unreviewed, through saveImplied. proof from the entry is checked against the paragraph. → { imported, skipped, file } */
export async function importRun({ file } = {}, { dir = path.join(process.cwd(), 'data', 'run') } = {}) {
  const name = file ? path.basename(file) : fs.readdirSync(dir).filter((n) => /^premise-reconcile-.*\.json$/.test(n)).sort().pop();
  if (!name || !/^premise-(reconcile|pilot)-[\w.:-]+\.json$/.test(name)) return { imported: 0, skipped: 0, error: 'no premise-reconcile or premise-pilot run file found' };
  const src = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const entries = src.entries || (src.premises || []).map((e) => ({ ...e, verdict: 'keep', newPremise: e.premise }));
  const by = new Map(); let skipped = 0;
  for (const e of entries) {
    if (!['keep', 'rescope', 'move'].includes(e.verdict) || !e.paraId) { skipped++; continue; }
    const qs = (Array.isArray(e.questions) ? e.questions : []).map((q) => String(q?.q ?? q ?? '').trim()).filter(Boolean);
    if (!qs.length) { skipped++; continue; }
    for (const q of qs) (by.get(e.paraId) || by.set(e.paraId, []).get(e.paraId)).push({ q, premise: e.verdict === 'rescope' ? e.newPremise : e.premise, implies: e.implies || '', proof: e.proof || '', concept: e.verdict === 'move' ? e.movedTo : e.concept });
  }
  let imported = 0; const docIds = new Set();
  for (const [paraId, items] of by) {
    // merge with what the paragraph already holds: saveImplied REPLACES live rows, so carry the existing ones through (same text keeps its status)
    const pv = await repo.paragraphView(paraId);
    if (!pv) { skipped += items.length; continue; }
    const texts = [pv.text, pv.original].filter(Boolean), { spanPresent } = await import('../rag/enrich/retrieval.js');
    const fresh = items.filter((i) => (spanPresent(i.proof, texts) === true) || (skipped++, false));
    const live = pv.rows.filter((r) => repo.LIVE.has(r.status)).map((r) => ({ q: r.question, premise: r.premise, implies: r.implies, proof: r.proof, concept: r.concept, status: r.status }));
    const have = new Set(live.map((l) => fold(l.q))), add = fresh.filter((i) => !have.has(fold(i.q)));
    if (!add.length) { skipped += fresh.length; continue; }
    const r = await repo.saveImplied(paraId, [...live, ...add], { source: 'pilot', editor: 'import' });
    if (r) { imported += add.length; if (r.reindex) docIds.add(r.docId); }
  }
  return { imported, skipped, file: name, docIds: [...docIds] };
}

const withLink = (r) => ({ ...r, link: readerUrl({ doc_id: r.docId, slug: r.doc?.slug, religion: r.doc?.religion, collection: r.doc?.collection }, r.paragraphIndex ?? null) });
/** The Scored view: scores (newest first, optional max) with doc + reader link. → { scores, next } */
export async function scoredList({ max, kind, limit, cursor } = {}) {
  const { rows, next } = await scores.listScores({ max, kind, limit, cursor });
  return { scores: rows.map(withLink), next };
}
export async function scoreStats() { const s = await scores.scoreStats(); return { ...s, worst: s.worst.map(withLink) }; }

const FAULTS = ['yesNo', 'namedBook', 'any'];
/** Random STATED legacy questions of one fault type (any = no filter, a control group) for hand scoring. Samples random content-id windows (primary-key range reads), filters in JS,
 *  ONE question per window (a whole window = neighbouring paragraphs of one book, which made the sample one book), until n found or MAX_TRIES windows read. rater '' / skipScored false = no skip-already-scored filter (the ops report). Dropped slots (q:'') never count; k = slot position. */
export async function sampleQuestions({ fault = 'yesNo', n = 20, rater = '', skipScored = true } = {}, deps = {}) {
  if (!FAULTS.includes(fault)) throw Object.assign(new Error(`fault must be one of ${FAULTS.join(', ')}`), { statusCode: 400, reason: 'bad fault' });
  const want = Math.min(Math.max(Number(n) || 20, 1), 200), WIN = 60, MAX_TRIES = Math.max(120, want * 8), rand = deps.rand || Math.random;
  const window = deps.window || repo.hypSampleWindow, maxId = await (deps.maxId || (await import('../paragraphs-repo.js')).maxContentId)();
  const questionFault = deps.fault || (await import('../rag/enrich/retrieval.js')).questionFault;
  const seen = new Set(), out = [];
  for (let t = 0; t < MAX_TRIES && out.length < want && maxId > 0; t++) {
    const rows = await window(1 + Math.floor(rand() * maxId), WIN), found = [], cands = [];
    for (const r of rows) {
      const hits = repo.splitHyp(r.hyp_questions).stated.map((x, k) => ({ x, k, q: typeof x === 'string' ? x : x?.q ?? x?.question ?? '' })).filter((h) => String(h.q).trim());
      for (const h of hits) if ((fault === 'any' || questionFault(h.q, r.d_title, { seeker: !!h.x?.seeker }) === fault) && !seen.has(`${r.id}|${h.k}`)) cands.push({ r, h });
    }
    if (cands.length) {
      const { r, h } = cands[Math.floor(rand() * cands.length)];
      seen.add(`${r.id}|${h.k}`);
      found.push({ paraId: r.id, docId: r.doc_id, k: h.k, question: String(h.q).trim(), fault, doc: { title: r.d_title ?? null, author: r.d_author ?? null, religion: r.d_religion ?? null },
        text: String(r.text || '').length > 600 ? String(r.text).slice(0, 600).replace(/\s+\S*$/, '') + '…' : String(r.text || ''),
        link: readerUrl({ doc_id: r.doc_id, slug: r.d_slug, religion: r.d_religion, collection: r.d_collection }, r.paragraph_index ?? null), myScore: null });
    }
    const mine = skipScored ? await scorer(found.map((f) => ({ paraId: f.paraId, question: f.question })), rater) : () => null;
    for (const f of found) if (out.length < want && mine(f.paraId, f.question) == null) out.push(f);
  }
  return { fault, items: out };
}

/** Upsert a data/run JSON array of {paraId, question, kind:'stated', score, tags?, note?, fault?, rater} through setScore. File must resolve inside data/run. → { imported, skipped } */
export async function importScores({ file } = {}, { dir = path.join(process.cwd(), 'data', 'run') } = {}) {
  const bad = (m) => Object.assign(new Error(m), { statusCode: 400, reason: m });
  if (!file || typeof file !== 'string' || !/\.json$/i.test(file)) throw bad('file (a .json under data/run) is required');
  const base = path.resolve(dir), full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) throw bad('file must be inside data/run');
  let arr; try { arr = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { throw bad(`cannot read ${path.basename(full)}: ${e.message}`); }
  if (!Array.isArray(arr)) throw bad('file must hold a JSON array');
  let imported = 0, skipped = 0;
  for (const e of arr) {
    const s = Number(e?.score);
    if (!e || !Number.isInteger(Number(e.paraId)) || !String(e.question ?? '').trim() || !Number.isInteger(s) || s < 1 || s > 5 || (e.kind && e.kind !== 'stated') || !String(e.rater ?? '').trim()) { skipped++; continue; }
    await scores.setScore({ paraId: e.paraId, question: e.question, kind: 'stated', score: s, tags: e.tags, note: e.note, fault: e.fault }, String(e.rater));
    imported++;
  }
  return { imported, skipped };
}
