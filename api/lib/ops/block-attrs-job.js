// Ops job: copy stable paragraph ids + display numbers (`{id="para_N" pn="M"}`, scripts/library/assign-block-ids.mjs) from
// library SOURCE files onto their stored rows — matched by the ingester's word hash, so no re-ingest, no re-embedding.
// Runs inside siftersearch-reports (never the API, never a script). Rows it cannot match are counted; those docs are the
// ones to re-ingest. Deps: docs-repo, block-attrs-repo, block-parser, ingester hash, config.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { listDocs } from '../docs-repo.js';
import { rowsForDoc, setBlockAttrs } from '../repos/block-attrs-repo.js';
import { parseMarkdownBlocks } from '../../services/block-parser.js';
import { hashContentWords } from '../../services/ingester.js';

const FM = /^---\n[\s\S]*?\n---\n/;
const KEYS = ['id', 'pn'];

/** Pure: file text + rows → [{ id, attrs }] to write, and how many rows matched. */
export function planDoc(fileText, rows) {
  const body = fileText.replace(FM, '');
  const want = new Map();
  for (const b of parseMarkdownBlocks(body, { splitOversized: false })) {
    if (!b.attrs?.id) continue;
    const h = hashContentWords(b.content);
    if (!want.has(h)) want.set(h, Object.fromEntries(KEYS.filter((k) => b.attrs[k] != null).map((k) => [k, String(b.attrs[k])])));
  }
  // headings never get ids (assign-block-ids skips them) — only TEXT rows count toward "unmatched"
  const isText = (r) => !/^heading/.test(r.blocktype || '') && !/^\s*#{1,6}\s/.test(r.text || '');
  const changes = []; let matched = 0, textRows = 0, unmatchedText = 0;
  for (const r of rows) {
    const text = isText(r); if (text) textRows++;
    const w = want.get(hashContentWords(r.text));
    if (!w) { if (text) unmatchedText++; continue; }
    matched++;
    const cur = r.block_attrs ? JSON.parse(r.block_attrs) : {};
    if (KEYS.every((k) => w[k] == null || cur[k] === w[k])) continue;
    changes.push({ id: r.id, attrs: { ...cur, ...w } });
  }
  return { changes, matched, blocks: want.size, textRows, unmatchedText };
}

/** params: { ids?: number[], limit?: number } — default every live main-library doc. */
export async function blockAttrsJob({ ids = null, limit = 0 } = {}) {
  const stats = { docs: 0, docs_with_ids: 0, rows: 0, text_rows: 0, matched: 0, unmatched_text_rows: 0, written: 0, docs_unmatched: 0, no_file: 0 };
  const needReingest = [];
  for (let after = 0; ;) {
    const page = await listDocs({ sourceSite: ids ? undefined : 'library', ids: ids || undefined, afterId: ids ? undefined : after, fields: ['id', 'file_path'], limit: 500 });
    if (!page.docs.length) break;
    for (const d of page.docs) {
      after = d.id; stats.docs++;
      const path = d.file_path && join(config.library.basePath, d.file_path);
      if (!path || !existsSync(path)) { stats.no_file++; continue; }
      const text = readFileSync(path, 'utf8');
      if (!/id="para_\d+"/.test(text)) continue;
      stats.docs_with_ids++;
      const rows = await rowsForDoc(d.id);
      const p = planDoc(text, rows);
      stats.rows += rows.length; stats.text_rows += p.textRows; stats.matched += p.matched; stats.unmatched_text_rows += p.unmatchedText;
      if (p.changes.length) { await setBlockAttrs(p.changes); stats.written += p.changes.length; }
      if (p.unmatchedText > 0) { stats.docs_unmatched++; if (needReingest.length < 20000) needReingest.push(d.id); }
      if (limit && stats.docs_with_ids >= limit) return { ...stats, need_reingest: needReingest };
    }
    if (ids || page.docs.length < 500) break;
  }
  return { ...stats, need_reingest: needReingest };
}

/** Why rows don't match their file blocks — per doc, a few unmatched rows beside the most similar block. params: { ids } */
export async function blockMismatchReport({ ids = [] } = {}) {
  const out = [];
  const { docs } = await listDocs({ ids, fields: ['id', 'title', 'file_path'], limit: ids.length || 1 });
  for (const d of docs) {
    const path = d.file_path && join(config.library.basePath, d.file_path);
    if (!path || !existsSync(path)) { out.push({ id: d.id, error: 'no file' }); continue; }
    const blocks = parseMarkdownBlocks(readFileSync(path, 'utf8').replace(FM, ''), { splitOversized: false }).filter((b) => b.attrs?.id);
    const bh = new Set(blocks.map((b) => hashContentWords(b.content)));
    const rows = (await rowsForDoc(d.id)).filter((r) => !/^heading/.test(r.blocktype || ''));
    const un = rows.filter((r) => !bh.has(hashContentWords(r.text)));
    const near = (t) => blocks.find((b) => b.content.slice(0, 30) === t.slice(0, 30)) || blocks.find((b) => b.content.includes(t.slice(5, 40)));
    out.push({ id: d.id, title: d.title, rows: rows.length, blocks: blocks.length, unmatched: un.length,
      samples: un.slice(0, 3).map((r) => ({ row: r.text.slice(0, 200), block: near(r.text)?.content.slice(0, 200) ?? null })) });
  }
  return { docs: out };
}
