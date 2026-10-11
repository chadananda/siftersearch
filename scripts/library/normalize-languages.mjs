#!/usr/bin/env node
// Normalise language labels in the DB (docs + live paragraphs) to ISO 639-1 (api/lib/language-codes.js). Paragraphs that
// change are marked synced=0 so the index carries the new label. Dry run unless --apply. Runs ON tower (writer).
//   node scripts/library/normalize-languages.mjs [--apply]
import dotenv from 'dotenv';
import { normLang } from '../../api/lib/language-codes.js';
import { docLanguageCounts, contentPairs, docsWithLanguage, relabel } from '../../api/lib/repos/language-repo.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const APPLY = process.argv.includes('--apply');
const docLabels = (await docLanguageCounts()).filter((r) => r.language && normLang(r.language) !== r.language);
const bad = docLabels.map((r) => r.language);
const changes = [];
for (const r of docLabels) for (const d of await docsWithLanguage(r.language)) changes.push({ table: 'docs', docId: d.id, from: r.language, to: normLang(r.language) });
// paragraphs: any non-normal label, whether or not the doc's own label was off (adapters wrote per-paragraph labels)
const allLabels = [...new Set([...bad, 'En', 'Eng', 'ENG', 'Fr', 'FR', 'Es', 'ES', 'Ger', 'ger', 'GER', 'De', 'DE', 'It', 'IT', 'NO', 'No', 'Ar', 'AR', 'Fa', 'FA', 'He', 'HE'])];
const pairs = await contentPairs(allLabels);
for (const p of pairs) changes.push({ table: 'content', docId: p.doc_id, from: p.language, to: normLang(p.language) });
const summary = {};
for (const c of changes) { const k = `${c.table}:${c.from}→${c.to}`; summary[k] = (summary[k] || 0) + 1; }
console.log(JSON.stringify({ apply: APPLY, docs: changes.filter((c) => c.table === 'docs').length,
  content_doc_pairs: pairs.length, content_rows: pairs.reduce((n, p) => n + p.n, 0), summary }));
if (APPLY) { await relabel(changes); console.log(JSON.stringify({ applied: changes.length })); }
process.exit(0);
