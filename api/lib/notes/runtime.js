// Wiring: the real paragraph loader and the real model, for the injected runner in ./chapter.js.
// Kept apart from the runner so the orchestration stays testable without a database or a model call — the
// two halves that made every other stage in this pipeline hard to debug when they were fused.
// Deps: api/lib/db.js, api/lib/rag/index.js + rag-adapter (the same wiring the stages use), ./profiles/*.

import { queryAll, queryOne } from '../db.js';
import { subjectKey } from './ledger.js';

/**
 * Load one chapter's paragraphs, each with the SUBJECTS the corpus already resolved for it.
 * This is why Dawn-Breakers is the right first book: identity here is a LOOKUP (424 bound mentions), not an
 * inference, so the repetition ledger keys on entity ids rather than on spellings.
 */
export async function loadChapter(docId, chapter) {
  const paras = await queryAll(
    `SELECT c.id, COALESCE(c.external_para_id, 'p' || c.id) para_id, c.paragraph_index, c.heading, c.text, c.context
       FROM content c
      WHERE c.doc_id = ? AND c.deleted_at IS NULL AND c.blocktype IN ('paragraph','quote')
      ORDER BY c.paragraph_index`, [docId], 'notes:load-chapter-paras');

  // Chapter assignment lives in scripts/entity-read/chapter-map.mjs; import lazily so a caller that only
  // wants paragraphs does not pay for the scene map.
  const { assignChapters } = await import('../../../scripts/entity-read/chapter-map.mjs');
  const { paras: mapped } = await assignChapters(docId);
  const byPid = new Map(mapped.map((m) => [m.pid, m]));

  const inChapter = paras.filter((p) => String(byPid.get(p.para_id)?.chapterNum ?? '') === String(chapter));
  const title = byPid.get(inChapter[0]?.para_id)?.chapterTitle || `Chapter ${chapter}`;

  // Resolved mentions → subjects, per paragraph. Only ACTIVE, resolved mentions: an unresolved surface is
  // not an identity and must not seed a repetition key.
  const ids = inChapter.map((p) => p.para_id);
  const mentions = ids.length
    ? await queryAll(
      `SELECT para_id, entity_id, surface, resolved_as FROM entity_mentions_v2
        WHERE doc_id = ? AND status = 'active' AND entity_id IS NOT NULL
          AND para_id IN (${ids.map(() => '?').join(',')})`, [docId, ...ids], 'notes:load-chapter-mentions')
    : [];
  const subjectsByPara = new Map();
  for (const m of mentions) {
    const list = subjectsByPara.get(m.para_id) || [];
    const key = subjectKey({ entityId: m.entity_id });
    if (!list.some((s) => s.key === key)) list.push({ key, entityId: m.entity_id, surface: m.surface, name: m.resolved_as });
    subjectsByPara.set(m.para_id, list);
  }

  return {
    title,
    paragraphs: inChapter.map((p) => ({ ...p, subjects: subjectsByPara.get(p.para_id) || [] })),
  };
}

/** Chapters present in a book, so a runner can be pointed at one without guessing. */
export async function listChapters(docId) {
  const { assignChapters } = await import('../../../scripts/entity-read/chapter-map.mjs');
  const { paras } = await assignChapters(docId);
  const seen = new Map();
  for (const p of paras) {
    if (!p.chapterNum) continue;
    const e = seen.get(p.chapterNum) || { chapter: p.chapterNum, title: p.chapterTitle, paragraphs: 0 };
    e.paragraphs++; seen.set(p.chapterNum, e);
  }
  return [...seen.values()];
}

/**
 * The model side. Routed through the SAME context the grounding stages use, so the spend policy applies
 * unchanged — English is deepseek-only ([[feedback_paid_models_persian_only]]), enforced at the adapter
 * chokepoint rather than trusted here.
 */
export async function makeModel(profileModule, { modelId = null } = {}) {
  const [{ buildContext }, { sifterDeps }] = await Promise.all([
    import('../rag/index.js'),
    import('../rag-adapter/index.js'),
  ]);
  const ctx = buildContext(sifterDeps());
  const route = { model: modelId || ctx.config.models?.disambig, fallback: ctx.config.models?.disambigFallback };
  const id = route.model;

  return {
    id,
    async chapterFrame({ title, text }) {
      const { parsed, raw } = await ctx.model.runLadder({
        route, system: 'You orient an instructor who is about to annotate a chapter. Be brief and concrete.',
        user: profileModule.chapterFramePrompt(title, text), parse: (r) => r, maxTokens: 500, temperature: 0.2,
      });
      return String(parsed ?? raw ?? '').trim();
    },
    async research({ paragraph, chapterFrame, taught }) {
      const { parsed, raw } = await ctx.model.runLadder({
        route, system: profileModule.systemPrompt(),
        user: profileModule.buildUser({ paragraph, chapterFrame, taught }),
        parse: (r) => r, maxTokens: 1200, temperature: 0.3,
      });
      return String(parsed ?? raw ?? '');
    },
  };
}
