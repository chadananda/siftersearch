// A media item's transcript into the library (Chad 10-21): transcript.md is written to <library>/<tradition>/Media/<slug>.md
// and ingested through the ingester + single writer (the same path as Dewey's intake), so search hits land on its
// paragraphs (block attrs t0/t1 → /media/<slug>?t=…). Its quotations and cross-references are stored as
// content_source_links on the transcript's paragraphs (method media-sourcehunt / media-cr), like the compilation links.
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { config } from '../config.js';

/** Quote/CR records → content_source_links rows, by the transcript paragraph (para_N) they sit in. Pure. */
export function linkRows({ quotes = [], teachings = [] }, paraIds, docId) {
  const rows = [];
  for (const q of [...quotes, ...teachings]) {
    const qid = paraIds.get(Number(q.para));
    const sid = q.source?.id ?? q.found_id;
    if (!qid || !sid) continue;
    rows.push({ quote_id: qid, source_id: Number(sid), quote_doc: docId, source_doc: q.source?.doc_id ?? null,
      coverage: q.kind === 'concept' ? Number(q.confidence) || null : Number(q.overlap) || null, share: null,
      basis: q.kind === 'concept' ? 'concept' : (q.basis || 'verbatim'), method: q.kind === 'concept' ? 'media-cr' : 'media-sourcehunt' });
  }
  const seen = new Set();
  return rows.filter((r) => { const k = `${r.quote_id}:${r.source_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function ingestTranscript({ dir, meta }, deps = {}) {
  const base = deps.base || config.library.basePath;
  const rel = join(meta.tradition || "Baha'i", 'Media', `${meta.slug}.md`);
  const md = await readFile(join(dir, 'transcript.md'), 'utf8');
  await mkdir(dirname(join(base, rel)), { recursive: true });
  await writeFile(join(base, rel), md);
  const ingest = deps.ingest || (async (text, r) => (await import('../../services/ingester.js')).ingestDocument(text, {}, r));
  const res = await ingest(md, rel);
  if (!res?.documentId) throw new Error(`ingest failed: ${res?.error || res?.status || 'no document id'}`);
  const repo = deps.repo || await import('../repos/media-repo.js');
  const rows = await repo.docParagraphMap(res.documentId);
  const paraIds = new Map();
  for (const r of rows) { try { const id = JSON.parse(r.block_attrs || '{}').id; const m = /^para_(\d+)$/.exec(id || ''); if (m) paraIds.set(Number(m[1]), r.id); } catch { /* no attrs */ } }
  let qj = {};
  try { qj = JSON.parse(await readFile(join(dir, 'quotes.json'), 'utf8')); } catch { /* no quotes stage */ }
  const links = linkRows(qj, paraIds, res.documentId);
  if (links.length) await (deps.saveLinks || (await import('../repos/source-links-repo.js')).saveSourceLinks)(links);
  return { documentId: res.documentId, rel, paragraphs: rows.length, links: links.length, status: res.status };
}
