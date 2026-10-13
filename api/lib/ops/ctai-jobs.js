// CTAI originals "paragraphed FROM THE ENGLISH" (Chad 10-11). CTAI's own pairs are stored on each English row
// (original_text, migration 120); these jobs turn them into an original-language library FILE per host book — one
// original paragraph per English paragraph, in the English order — then ingest it and link 1:1. Server-side only (ops worker).
//   ctai-originals: write files   ·   ingest-files: ingest by path/doc id   ·   ctai-link: content_alignment by `align`
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { getDoc, listDocs } from '../docs-repo.js';
import { ctaiPairs, anchorsForDoc, insertLinks } from '../repos/alignment-repo.js';
import { CTAI_DOC_BY_WORK } from '../rag/concepts/ctai.js';
import { withAIContext } from '../ai-context.js';

export const CTAI_DIR = "Baha'i/CTAI Originals";
const attrsOf = (r) => { try { return JSON.parse(r.block_attrs || '{}'); } catch { return {}; } };
/** The English paragraph's stable anchor: its file id (library) or site id (OceanLibrary), else its row id. */
export const anchorOf = (r) => attrsOf(r).id || r.external_para_id || `c${r.id}`;
const esc = (v) => String(v).replace(/"/g, '');

/** Pure: English pair rows → the original file's text. */
export function originalFile({ title, hostDoc, works }, rows) {
  const langs = {};
  for (const r of rows) langs[r.original_lang || 'ar'] = (langs[r.original_lang || 'ar'] || 0) + 1;
  const lang = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] || 'ar';
  const fm = ['---', `title: "${esc(title)} — original (CTAI paragraphing)"`, `language: ${lang}`, 'needs_segmentation: false', 'sentence_markers: defer',
    `ctai_host_doc: ${hostDoc}`, `ctai_works: [${works.map((w) => `"${w}"`).join(', ')}]`,
    'notes: "Built from CTAI paragraph pairs: one original paragraph per English paragraph, in the English order (align = the English paragraph id)."', '---', ''];
  const blocks = rows.map((r, k) => {
    const a = [`id="para_${k + 1}"`, ...(attrsOf(r).pn ? [`pn="${esc(attrsOf(r).pn)}"`] : []), `align="${esc(anchorOf(r))}"`, `language="${r.original_lang || lang}"`];
    return `${String(r.original_text).trim()}\n{${a.join(' ')}}`;
  });
  return `${fm.join('\n')}\n${blocks.join('\n\n')}\n`;
}

export async function ctaiOriginalsJob() {
  const hosts = {};
  for (const [w, d] of Object.entries(CTAI_DOC_BY_WORK)) (hosts[d] ||= []).push(w);
  const out = [];
  for (const [doc, works] of Object.entries(hosts)) {
    const d = await getDoc(Number(doc), { fields: ['id', 'title'] });
    const rows = await ctaiPairs(Number(doc));
    if (!d || !rows.length) { out.push({ host: Number(doc), skipped: !d ? 'no doc' : 'no pairs' }); continue; }
    const rel = join(CTAI_DIR, `${d.title.replace(/[/\\:]/g, '-').slice(0, 120)} (original).md`);
    const abs = join(config.library.basePath, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, originalFile({ title: d.title, hostDoc: d.id, works }, rows));
    out.push({ host: d.id, works, file: rel, paragraphs: rows.length });
  }
  return { files: out };
}

/** params: { paths?: relPaths[], ids?: docIds[] } — ingest each file in THIS process (never the API). localOnly: a bulk re-ingest
 *  must NEVER spend — 10-11 the ingester's Arabic branch called Haiku per file (sentence markers) mid-batch, unapproved. */
/** Back off while the writer or the API is slow: a bulk job must never be why the site stops processing (Chad 10-11). */
export async function waitForQuietWriter({ maxWaitMs = 30 * 60_000 } = {}) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const probe = async (url) => { const t = Date.now(); try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); return r.ok ? Date.now() - t : 99999; } catch { return 99999; } };
    const w = await probe('http://127.0.0.1:7849/health'), a = await probe(`http://127.0.0.1:${process.env.API_PORT || 7839}/api/v1/health`);
    if ((w < 500 && a < 1500) || Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

const inQuietWindow = (d = new Date()) => { const h = d.getHours(); return h >= 22 || h < 7; };   // same window as ops/reports.js

export async function ingestFilesJob({ paths = [], ids = [] } = {}) {
  const { ingestDocument } = await import('../../services/ingester.js');
  const rels = [...paths];
  if (ids.length) for (let i = 0; i < ids.length; i += 500) {
    const { docs } = await listDocs({ ids: ids.slice(i, i + 500), fields: ['id', 'file_path'], limit: 500 });
    rels.push(...docs.map((d) => d.file_path).filter(Boolean));
  }
  const res = { files: rels.length, ok: 0, failed: [], statuses: {}, paced_ms: 0 };
  for (const rel of rels) {
    await waitForQuietWriter();
    const abs = join(config.library.basePath, rel);
    if (!existsSync(abs)) { res.failed.push({ rel, error: 'no file' }); continue; }
    const t0 = Date.now();
    try {
      const r = await withAIContext({ caller: 'ops-ingest', localOnly: true }, () => ingestDocument(readFileSync(abs, 'utf8'), {}, rel));
      res.statuses[r.status] = (res.statuses[r.status] || 0) + 1;
      if (r.status === 'error') res.failed.push({ rel, error: r.error }); else res.ok++;
    } catch (err) { res.failed.push({ rel, error: String(err.message || err).slice(0, 200) }); }
    // duty cycle: by day rest twice as long as the book took (bulk ingest holds the single writer ≤ ⅓ of the time); overnight
    // (22:00–07:00, the quiet window) rest half as long — heavy work belongs to the night (10-13: a 1,000-file batch took 30 h,
    // 20 of them resting)
    const rest = Math.max(1000, (inQuietWindow() ? 0.5 : 2) * (Date.now() - t0)); res.paced_ms += rest;
    await new Promise((r) => setTimeout(r, rest));
  }
  res.failed = res.failed.slice(0, 200);
  return res;
}

/** Link each CTAI original paragraph to its English paragraph (by `align`), 1:1, basis ctai-pair. */
export async function ctaiLinkJob() {
  const { docs } = await listDocs({ title: '(CTAI paragraphing)', fields: ['id', 'title', 'file_path'], limit: 100 });
  const out = [];
  for (const o of docs.filter((x) => String(x.file_path || '').startsWith(CTAI_DIR))) {
    const host = Number((readFileSync(join(config.library.basePath, o.file_path), 'utf8').match(/^ctai_host_doc:\s*(\d+)/m) || [])[1]);
    if (!host) { out.push({ orig: o.id, error: 'no ctai_host_doc' }); continue; }
    const eng = new Map((await anchorsForDoc(host)).map((r) => [anchorOf(r), r.id]));
    const links = [];
    let unresolved = 0;
    for (const r of await anchorsForDoc(o.id)) {
      const al = attrsOf(r).align; const t = al && eng.get(al);
      if (t) links.push({ transId: t, origId: r.id, transDoc: host, origDoc: o.id }); else unresolved++;
    }
    await insertLinks(links, 'ctai-pair', 'ctai-originals-file');
    out.push({ orig: o.id, host, linked: links.length, unresolved });
  }
  return { docs: out };
}
