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
  const changes = []; let matched = 0;
  for (const r of rows) {
    const w = want.get(hashContentWords(r.text));
    if (!w) continue;
    matched++;
    const cur = r.block_attrs ? JSON.parse(r.block_attrs) : {};
    if (KEYS.every((k) => w[k] == null || cur[k] === w[k])) continue;
    changes.push({ id: r.id, attrs: { ...cur, ...w } });
  }
  return { changes, matched, blocks: want.size };
}

/** params: { ids?: number[], limit?: number } — default every live main-library doc. */
export async function blockAttrsJob({ ids = null, limit = 0 } = {}) {
  const stats = { docs: 0, docs_with_ids: 0, rows: 0, matched: 0, written: 0, docs_unmatched: 0, no_file: 0 };
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
      stats.rows += rows.length; stats.matched += p.matched;
      if (p.changes.length) { await setBlockAttrs(p.changes); stats.written += p.changes.length; }
      if (p.matched < Math.min(rows.length, p.blocks)) { stats.docs_unmatched++; if (needReingest.length < 500) needReingest.push(d.id); }
      if (limit && stats.docs_with_ids >= limit) return { ...stats, need_reingest: needReingest };
    }
    if (ids || page.docs.length < 500) break;
  }
  return { ...stats, need_reingest: needReingest };
}
