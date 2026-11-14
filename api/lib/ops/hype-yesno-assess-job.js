// Ops report `hype-yesno-assess`: the MODEL judges each legacy STATED yes/no HyPE question with its passage (Chad 11-13: "Some few questions are legitimately yes/no. You should be able to assess that").
// keep → closed:true (plain yes/no the passage settles) · rewrite → open form, was kept · drop → slot emptied { q:'', dropped:'yesNo', was } (k stays stable; indexer deletes the point).
// params { apply?: false, limit? (paragraphs; default 50, REQUIRED explicit for apply), sampleOnly? (true = never write, even with apply) } → { apply, paragraphs, questions, keep, rewrite, drop, unanswered, usd, usdPerQuestion, samples[all], docs, written?, reindex? }
// Dry run still CALLS the model (that is the measurement) but writes nothing. Idempotent: closed / rewritten / dropped items no longer fault as yesNo, so they are never re-sent.
// Model = HyPE's own (claude-haiku-5-5, pipeline/profile.js HAIKU_ALL.hype), stage 'hype-yesno', metered + spend-capped by ai.js chatCompletion; plain calls (a few hundred), not the batch API.
import * as implied from '../repos/implied-repo.js';
import { maxContentId } from '../paragraphs-repo.js';
import { questionFault, spanIsPresent } from '../rag/enrich/retrieval.js';
import { costOf } from '../rag-adapter/usage.js';

export const YESNO_MODEL = 'claude-haiku-5-5';
const WIN = 20000, CHUNK = 200, CONC = 4, PASSAGE_MAX = 8000;
const isImp = (x) => x && typeof x === 'object' && x.implied;
const qOf = (x) => (typeof x === 'string' ? x : x?.q ?? x?.question ?? '');
const fold = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const SYSTEM = `You judge search questions that were written for a passage of a sacred-text and religious-studies library. Each question below begins with a yes/no word (Is, Does, Can, Do, Has, Will...). A reader searching the library will type a question; yes/no questions are usually poor search questions, because a "yes" flattens a rich teaching into a verdict. Your job is to decide, for EACH question, one of three verdicts:

KEEP: only when ALL of these hold: (1) it is a plain, concrete yes/no question; (2) the passage settles it with a clear yes or no; (3) real readers genuinely ask it in exactly that form; (4) the yes or no IS the whole answer, nothing important is lost. KEEP IS RARE. Example to keep: "Can people of any religion pray in a Bahá'í House of Worship?" (the answer is simply yes, and people really ask it).

REWRITE: the passage does teach something worth finding, but the yes/no form flattens it. Rewrite as an OPEN question (What, Why, How, Which, Who, When, Where), about the same subject, answerable from the passage. Example: "Do Bahá'í teachings offer a pattern for future society?" becomes "What pattern for future society do the Bahá'í teachings offer?". Rules for the rewrite: it must NOT begin with a yes/no word; it must not mention "the passage", "the paragraph", "the text", "the author", "this prayer" or similar; it must not name the book; keep the passage's own key terms, never replace them with an abstraction; plain English; one sentence.

DROP: there is no good question here (the passage does not really answer it, it is trivial, vague, or it only restates the passage).

Reply with ONLY JSON, no commentary: {"verdicts":[{"i":0,"verdict":"keep","a":"the passage's exact words that give the yes or no"},{"i":1,"verdict":"rewrite","q":"the open question"},{"i":2,"verdict":"drop"}]} with one entry per question, "i" being the question's number as given.`;

const userOf = (title, passage, qs) => `Book: ${title || 'unknown'}\n\nPassage:\n${String(passage || '').slice(0, PASSAGE_MAX)}\n\nQuestions:\n${qs.map((x, i) => `${i}. ${x.q}${x.a ? `\n   answer span: ${String(x.a).slice(0, 400)}` : ''}`).join('\n')}`;

/** reply text → Map(i → {verdict, q}) (only well-formed entries) */
export function parseVerdicts(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return new Map();
  try {
    const out = new Map();
    for (const v of JSON.parse(m[0]).verdicts || []) if (Number.isInteger(v?.i) && ['keep', 'rewrite', 'drop'].includes(v.verdict)) out.set(v.i, { verdict: v.verdict, q: String(v.q || '').trim(), a: String(v.a || '').trim() });
    return out;
  } catch { return new Map(); }
}

async function defaultChat(messages, ctx) {
  const { chatCompletion } = await import('../ai.js'), { withAIContext } = await import('../ai-context.js');
  return withAIContext({ stage: 'hype-yesno', caller: 'hype-yesno', docId: ctx.docId }, () => chatCompletion(messages, { provider: 'anthropic', model: YESNO_MODEL, maxTokens: 1500, usePromptCache: true }));
}

export async function hypeYesnoAssessJob(params = {}, deps = {}) {
  const d = { window: implied.hypWindow, titles: implied.titleOfDocs, texts: implied.paragraphTexts, maxId: maxContentId, fault: questionFault, replace: implied.replaceHypIf, reindex: null,
    chat: defaultChat, cost: costOf, log: console, yieldTick: () => new Promise((r) => setImmediate(r)), ...deps };
  const apply = params.apply === true && !params.sampleOnly, given = Number(params.limit) > 0 ? Math.floor(Number(params.limit)) : null;
  if (apply && !given) throw Object.assign(new Error('apply requires an explicit limit (paragraphs)'), { statusCode: 400 });
  const limit = given ?? 50, titles = new Map(), docs = new Set(), samples = [];
  const tot = { paragraphs: 0, questions: 0, keep: 0, rewrite: 0, drop: 0, unanswered: 0 };
  let usd = 0, written = 0;
  const top = await d.maxId();
  for (let from = 0; from < top && tot.paragraphs < limit; from += WIN) {
    const rows = await d.window(from, from + WIN), need = [...new Set(rows.map((r) => r.doc_id))].filter((i) => !titles.has(i));
    if (need.length) for (const [id, t] of await d.titles(need)) titles.set(id, t);
    // candidates: paragraphs with at least one STATED yes/no the gate still faults and the model has not judged
    const cands = [];
    for (const r of rows) {
      if (tot.paragraphs + cands.length >= limit) break;
      let arr = null;
      if (typeof r.hyp_questions === 'string' && r.hyp_questions.startsWith('[')) { try { const v = JSON.parse(r.hyp_questions); if (Array.isArray(v)) arr = v; } catch { /* legacy text */ } }
      if (!arr) arr = String(r.hyp_questions || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const idx = arr.map((x, k) => [x, k]).filter(([x]) => !isImp(x) && qOf(x) && d.fault(qOf(x), titles.get(r.doc_id), { seeker: !!x?.seeker, closed: x?.closed === true }) === 'yesNo').map(([, k]) => k);
      if (idx.length) cands.push({ r, arr, idx });
    }
    if (!cands.length) { await d.yieldTick(); continue; }
    const texts = await d.texts(cands.map((c) => c.r.id));
    const updates = [];
    const judge = async ({ r, arr, idx }) => {
      const title = titles.get(r.doc_id), passage = texts.get(r.id)?.text || '';
      const qs = idx.map((k) => ({ q: qOf(arr[k]), a: typeof arr[k] === 'object' ? arr[k]?.a : '' }));
      let reply;
      try { reply = await d.chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: userOf(title, passage, qs) }], { docId: r.doc_id }); }
      catch (e) { if (e?.fatal || e?.name === 'SpendCapError') throw e; d.log.warn?.({ para: r.id, err: String(e.message).slice(0, 120) }, 'hype-yesno-assess: call failed'); return; }
      const u = reply?.usage || {};
      usd += d.cost({ model: YESNO_MODEL, promptTokens: u.promptTokens || 0, completionTokens: u.completionTokens || 0, cachedTokens: u.cachedTokens || 0 });
      const verdicts = parseVerdicts(reply?.content ?? reply?.text), next = arr.slice(), have = new Set(arr.map((x) => fold(qOf(x))));
      let changed = 0;
      idx.forEach((k, i) => {
        const v = verdicts.get(i), old = arr[k], item = typeof old === 'string' ? { q: old, a: '' } : old;
        tot.questions++;
        if (!v) { tot.unanswered++; return; }   // no usable verdict: left as is, found again by the next run
        let verdict = v.verdict, newQ = null;
        if (verdict === 'rewrite') {
          // the rewrite must itself pass the gate (open form, no self reference, no book name) and not repeat a question the paragraph already has
          if (!v.q || d.fault(v.q, title, { seeker: !!item.seeker }) || have.has(fold(v.q))) verdict = 'drop'; else { newQ = v.q; have.add(fold(v.q)); }
        }
        // a kept yes/no stands only on answering words found in the passage — the same rule commitHype applies to new ones
        let span = item.a || '';
        if (verdict === 'keep') { span = [v.a, item.a].find((x) => x && spanIsPresent(x, [passage]) === true); if (!span) { verdict = 'drop'; tot.keepUnverified = (tot.keepUnverified || 0) + 1; } }
        tot[verdict]++;
        next[k] = verdict === 'keep' ? { ...item, a: span, closed: true } : verdict === 'rewrite' ? (({ closed, ...rest }) => ({ ...rest, q: newQ, a: item.a ?? '', was: item.q }))(item) : { q: '', dropped: 'yesNo', was: item.q };
        samples.push({ paraId: r.id, docId: r.doc_id, doc: title || null, passage: String(passage).slice(0, 300), q: item.q, verdict, newQ });
        changed++;
      });
      if (!changed) return;
      tot.paragraphs++; docs.add(r.doc_id);
      updates.push({ id: r.id, from: r.hyp_questions, to: JSON.stringify(next) });
    };
    for (let i = 0; i < cands.length; i += CONC) await Promise.all(cands.slice(i, i + CONC).map(judge));
    if (apply) for (let i = 0; i < updates.length; i += CHUNK) written += await d.replace(updates.slice(i, i + CHUNK));
    d.log.info?.({ from, ...tot, usd: +usd.toFixed(4), written }, 'hype-yesno-assess: window');
    await d.yieldTick();
  }
  const out = { apply, model: YESNO_MODEL, ...tot, docs: docs.size, usd: +usd.toFixed(5), usdPerQuestion: tot.questions ? +(usd / tot.questions).toFixed(6) : 0, samples };
  if (apply) {
    out.written = written;
    const ids = [...docs];
    out.reindex = ids.length ? await (d.reindex || (async (x) => (await import('../implied/service.js')).queueReindex(x)))(ids) : 'none';
  }
  return out;
}
