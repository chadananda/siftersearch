// dewey-reimport ops job — re-read Dewey imports from their ARCHIVED source with today's extraction and text cleaner, and
// re-ingest each into the SAME document (same id, same library file; unchanged paragraphs keep their ids by hash). The
// 10-18 inspection found printed lines stored as paragraphs in 133 of 169 imports — this repairs them; the index chain
// re-measures and refills what changed. params { docs?: [docId], all?: true, limit? }.
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { listItems, updateItem } from '../repos/dewey-repo.js';
import { getDoc } from '../docs-repo.js';
import { extractText, toMarkdown } from '../dewey/intake.js';
import { cleanText } from '../dewey/clean.js';
import { slpToText } from '../dewey/searchlayer.js';
import { config } from '../config.js';
import { withAIContext } from '../ai-context.js';
import { waitForQuietWriter } from './ctai-jobs.js';
import { detectLang } from '../pipeline/profile.js';

export async function deweyReimportJob({ docs = null, all = false, limit = 500 } = {}, deps = {}) {
  const { items = async () => listItems({ state: 'ingested', limit: 5000 }), ingest = async (md, meta, rel) => (await import('../../services/ingester.js')).ingestDocument(md, meta, rel),
    base = config.library.basePath } = deps;
  const want = docs ? new Set(docs.map(Number)) : null;
  const todo = (await items()).filter((i) => i.doc_id && (all || want?.has(i.doc_id))).slice(0, limit);
  const out = { reimported: 0, skipped: 0, errors: [], changes: [] };
  for (const i of todo) {
    try {
      const doc = await getDoc(i.doc_id, { fields: ['id', 'file_path', 'paragraph_count', 'language'] });
      if (!doc?.file_path || !i.original_path) { out.skipped++; continue; }
      const slp = i.identified?.slp;
      const ext = i.original_path.split('.').pop().toLowerCase();
      let text;
      if (slp?.path) text = slpToText(String(await readFile(slp.path))).text;
      else ({ text } = ext === 'pdf' ? await extractText(null, ext, i.original_path) : await extractText(await readFile(i.original_path), ext));
      text = cleanText(text);
      const r = i.research || {};
      const title = r.matched && r.title ? r.title : i.title, author = (r.matched && r.author) || i.author || null;
      const language = doc.language || detectLang(text.slice(0, 6000), null) || 'en';
      const md = toMarkdown({ title, author, language, research: r, sourceUrl: i.source_url, sha256: i.sha256, itemId: i.id }, text);
      await writeFile(join(base, doc.file_path), md);
      await waitForQuietWriter();
      const res = await withAIContext({ caller: 'dewey-reimport', localOnly: true }, () => ingest(md, { id: i.doc_id }, doc.file_path));
      out.reimported++;
      out.changes.push({ doc_id: i.doc_id, title: String(title).slice(0, 60), before: doc.paragraph_count, after: res?.paragraphCount ?? null });
      await updateItem(i.id, {}, `re-imported with the text cleaner: ${doc.paragraph_count} → ${res?.paragraphCount ?? '?'} paragraphs`);
    } catch (err) { out.errors.push({ doc_id: i.doc_id, err: String(err.message).slice(0, 160) }); }
  }
  return out;
}
