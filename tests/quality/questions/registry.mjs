// Question registry reader/validator. Source of truth: questions/*.jsonl (written by import.mjs). Schema: schema.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ORIGINS = ['survey', 'log', 'seo', 'seed', 'chad', 'perplexity-miss', 'regression'];
export const SCOPES = ['tradition', 'cross', 'universal'];
export const LAYERS = ['search', 'hype', 'anis'];
export const TRADITIONS = ['bahai', 'judaism', 'buddhism', 'islam', 'christianity', 'hinduism', 'zoroastrianism', 'taoism', 'confucianism', 'sikhism', 'jainism'];
// returns array of problems ([] = valid)
export const validate = (q) => {
  const e = [], isStrs = (a) => Array.isArray(a) && a.every((s) => typeof s === 'string');
  if (!q || typeof q !== 'object') return ['not an object'];
  if (typeof q.id !== 'string' || !q.id) e.push('id');
  if (typeof q.text !== 'string' || !q.text.trim()) e.push('text');
  if (q.family != null && typeof q.family !== 'string') e.push('family');
  if (!isStrs(q.traditions) || q.traditions.some((t) => !TRADITIONS.includes(t))) e.push('traditions');
  if (typeof q.lang !== 'string') e.push('lang');
  if (!SCOPES.includes(q.scope)) e.push('scope');
  if (q.scope === 'cross' && (q.traditions || []).length < 2) e.push('cross needs >=2 traditions');
  if (q.scope === 'tradition' && q.traditions?.length !== 1) e.push('tradition scope needs 1 tradition');
  if (!ORIGINS.includes(q.origin)) e.push('origin');
  if (q.source_url != null && typeof q.source_url !== 'string') e.push('source_url');
  const x = q.expect;
  if (x != null) {
    if (typeof x !== 'object') e.push('expect');
    else {
      if (x.docs != null && !(Array.isArray(x.docs))) e.push('expect.docs');
      if (x.text_contains != null && !isStrs(x.text_contains)) e.push('expect.text_contains');
      if (x.author != null && typeof x.author !== 'string' && !isStrs(x.author)) e.push('expect.author');
      if (x.max_rank != null && !Number.isInteger(x.max_rank)) e.push('expect.max_rank');
    }
  }
  if (!Array.isArray(q.wordings)) e.push('wordings');
  if (!Array.isArray(q.layers) || !q.layers.length || q.layers.some((l) => !LAYERS.includes(l))) e.push('layers');
  if (!q.legacy || typeof q.legacy !== 'object') { if (q.origin !== 'chad') e.push('legacy'); }
  return e;
};
export const loadFamilies = () => JSON.parse(fs.readFileSync(path.join(DIR, 'families.json'), 'utf8'));
export const loadQuestions = ({ origin, family, tradition, layer, scope } = {}) => fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).sort()
  .flatMap((f) => fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  .filter((q) => (!origin || q.origin === origin) && (!family || q.family === family) && (!tradition || q.traditions.includes(tradition))
    && (!layer || q.layers.includes(layer)) && (!scope || q.scope === scope));
