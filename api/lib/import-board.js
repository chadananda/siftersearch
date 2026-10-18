// The Observatory's IMPORT BOARD (Chad 10-18: "a small section for current activity details … progress stages of each new
// book we are importing … the flow of new material and what we do for each. SearchLayerPDF returns a detailed work activity
// receipt"). Dewey items → public rows: each book's stages (checked → appraised → OCR → imported → indexed), what is
// happening now, and the OCR receipt. Never a file path, never an offer still awaiting a yes. Deps: dewey-repo, coverage-repo.
import { importBoard } from './repos/dewey-repo.js';
import { coverageForDocs } from './repos/coverage-repo.js';

const INDEX = [['Text', 'text'], ['Structure', 'sections'], ['BM25', 'keyword'], ['Refs', 'refs'], ['Vectors', 'embedding'], ['Phrases', 'phrase']];
const layerDone = (r) => { if (!r) return 'todo'; const done = r.generated ?? r.indexed ?? r.current ?? r.reached ?? 0, total = r.total ?? 0; return !total || done >= total ? 'done' : done > 0 ? 'active' : 'todo'; };

/** One item → its stage chips: state is done | active | todo | wait | fail | skip. Pure. */
export function stagesOf(item, layers = null) {
  const s = item.state, id = item.identified || {}, slp = id.slp, wantsOcr = !!(slp || id.slp_progress || id.slp_rejected || s === 'needs-ocr');
  const imported = s === 'ingested';
  const stages = [
    { key: 'checked', label: 'Checked', state: 'done' },
    { key: 'appraised', label: 'Appraised', state: id.appraisal?.title ? 'done' : wantsOcr ? 'todo' : s === 'needs-human' ? 'wait' : 'todo' },
  ];
  if (wantsOcr) stages.push({ key: 'ocr', label: 'OCR', state: slp ? 'done' : id.slp_rejected ? 'fail' : s === 'needs-ocr' ? 'active' : s === 'needs-human' ? 'wait' : 'todo' });
  stages.push({ key: 'imported', label: 'Imported', state: imported ? 'done' : s === 'processing' ? 'active' : s === 'failed' ? 'fail' : s === 'needs-human' ? 'wait' : 'todo' });
  for (const [label, key] of INDEX) stages.push({ key, label, state: imported ? layerDone(layers?.[key]) : 'todo', index: true });
  return stages;
}

const NOW = { source: 'queued for import', processing: 'being imported', 'needs-ocr': 'full OCR', 'needs-human': 'waiting for review', ingested: 'in the library', failed: 'failed' };

/** → { counts, items } for GET /api/observatory/imports. */
export async function buildImportBoard({ board = importBoard, coverage = coverageForDocs } = {}) {
  const b = await board();
  const docIds = b.items.map((i) => i.doc_id).filter(Boolean);
  const layers = docIds.length ? await coverage(docIds).catch(() => ({})) : {};
  const items = b.items.map((i) => {
    const id = i.identified || {}, slp = id.slp, prog = id.slp_progress;
    const last = String(i.log?.at(-1)?.why || '').replace(/\/(?:tank|home|Users|mnt)\/\S*/g, (m) => `…/${m.split('/').pop()}`).slice(0, 220);   // no server paths
    return {
      id: i.id, title: i.title, author: i.author || id.appraisal?.author || null, state: i.state, now: NOW[i.state] || i.state, updated_at: i.updated_at,
      doc_id: i.doc_id || null, shelf: id.shelf ? `${id.shelf.religion} › ${id.shelf.collection}` : null, kind: id.appraisal?.kind || i.kind || null,
      summary: id.appraisal?.summary || null, last,
      stages: stagesOf(i, i.doc_id ? layers[i.doc_id] : null),
      ocr: slp ? { done: true, pages: slp.pages, score: slp.score, cost_cents: slp.cost_cents, check: slp.check ? { words: slp.check.words, per_page: slp.check.perPage, sample_found: slp.check.sampleFound } : null, receipt: slp.receipt || null }
        : prog ? { done: false, status: prog.step, stage: prog.stage, pages_done: prog.pages_done, pages_total: prog.pages_total, at: prog.at }
          : id.slp_rejected ? { done: false, rejected: true, why: id.slp_rejected.check?.why || [], receipt: id.slp_rejected.receipt || null } : null,
    };
  });
  const st = b.byState || {};
  return { counts: { imported_24h: b.imported_24h, imported_7d: b.imported_7d, in_progress: (st.source || 0) + (st.processing || 0), ocr: st['needs-ocr'] || 0, waiting: st['needs-human'] || 0, failed: st.failed || 0, in_library: st.ingested || 0 }, items };
}
