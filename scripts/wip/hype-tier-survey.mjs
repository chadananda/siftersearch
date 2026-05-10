#!/usr/bin/env node
// Survey paragraph counts and estimated input tokens by HyPE-priority tier.
// Uses character-count-based token estimation per user spec (≈4 chars/token
// for English/Latin scripts, 2 for RTL, 2.5 for mixed).

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'sifter.db');

// Author matchers per tier — covers transliteration variants
const TIERS = [
  ['01 Shoghi Effendi', a => a === 'Shoghi Effendi'],
  ['02 UHJ + Compilations', a => a === 'Universal House of Justice' || /compiled/i.test(a)],
  ['03 Abdul-Baha', a => /Abdu['’]l[-‐]Bah[áa]/.test(a)],
  ['04 Bahaullah', a => /Bah[áa]['’]u['’]ll[áa]h/.test(a)],
  ['05 The Bab', a => a === 'The Báb' || a === 'The Bab' || /^Báb$|^Bab$/.test(a)],
  ['06 Esslemont', a => /Esslemont/.test(a)],
  ['07 Nabil', a => /Nabíl|Nabil(?!es)/.test(a)],
];

const RELIGION_BAHAI = /^Bah[áa]['’]?i$/;
const RELIGION_OTHER_DOCTRINAL = /^(Islam|Christian|Christianity|Judaism|Buddhist|Buddhism|Hindu|Hinduism|Sikh|Sikhism|Zoroastrian|Zoroastrianism|Jain|Jainism|Confucian|Tao)$/;

function classify(author, religion) {
  for (const [name, fn] of TIERS) if (fn(author || '')) return name;
  if (RELIGION_BAHAI.test(religion || '')) return '08 Other Bahai (scholars/secondary)';
  if (RELIGION_OTHER_DOCTRINAL.test(religion || '')) return '09 Other religions doctrinal';
  return '10 Misc / unknown';
}

// Token estimator (matches enrichment script's logic)
function estimateTokens(text) {
  if (!text) return 0;
  // Cheap RTL detection
  const rtlChars = (text.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const rtlRatio = rtlChars / Math.max(text.length, 1);
  const cpt = rtlRatio > 0.5 ? 2 : (rtlRatio > 0.1 ? 2.5 : 4);
  return Math.ceil(text.length / cpt);
}

const db = new Database(DB_PATH, { readonly: true });
const docs = db.prepare('SELECT id, author, religion FROM docs WHERE deleted_at IS NULL').all();
const contentStmt = db.prepare('SELECT text FROM content WHERE doc_id = ? AND deleted_at IS NULL');

const buckets = new Map();

let processed = 0;
for (const doc of docs) {
  const tier = classify(doc.author, doc.religion);
  let b = buckets.get(tier);
  if (!b) {
    b = { docs: 0, paragraphs: 0, paraTokens: 0, charCount: 0 };
    buckets.set(tier, b);
  }
  b.docs++;
  const rows = contentStmt.all(doc.id);
  for (const r of rows) {
    b.paragraphs++;
    b.charCount += (r.text || '').length;
    b.paraTokens += estimateTokens(r.text || '');
  }
  processed++;
  if (processed % 1000 === 0) process.stderr.write(`  ${processed}/${docs.length}\n`);
}

const sorted = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));

console.log('Tier'.padEnd(40), 'Docs'.padStart(7), 'Paragraphs'.padStart(12), 'ParaTokens(M)'.padStart(15), 'EstInputTokens(M)'.padStart(20));
console.log('─'.repeat(95));
let totalDocs = 0, totalParas = 0, totalParaTokens = 0;
for (const [tier, b] of sorted) {
  // For HyPE: each call sends ~9 paragraphs context window. Conservative est:
  // input tokens per paragraph = paraTokens × ~9 (window) + ~200 (system+user prompt)
  // But context window is shared across N calls if cached, so true input cost is
  // closer to paraTokens × 5 (5 windows of ~5 paragraphs each, target shifts)
  const estInputTokens = b.paraTokens * 5 + b.paragraphs * 200; // rough — see comment
  console.log(
    tier.padEnd(40),
    String(b.docs).padStart(7),
    String(b.paragraphs).padStart(12),
    (b.paraTokens / 1e6).toFixed(2).padStart(15),
    (estInputTokens / 1e6).toFixed(2).padStart(20)
  );
  totalDocs += b.docs; totalParas += b.paragraphs; totalParaTokens += b.paraTokens;
}
console.log('─'.repeat(95));
console.log('TOTAL'.padEnd(40), String(totalDocs).padStart(7), String(totalParas).padStart(12), (totalParaTokens / 1e6).toFixed(2).padStart(15));

db.close();
