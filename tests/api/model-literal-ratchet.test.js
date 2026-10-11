// Model choices live in ONE table, api/lib/model-roles.js (Chad 10-11: re-assess periodically for better, faster, cheaper
// models). A hard-coded model id elsewhere in api/ is a choice nobody will re-assess. Frozen 10-11; SHRINK-ONLY: a new file
// fails, and a file that moved onto modelFor() must leave the list.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const MODEL = /['"`](gpt-[0-9a-z.-]+|claude-[a-z0-9.-]+|deepseek-[a-z0-9.-]+|gemini-[0-9a-z.-]+|jev-[a-z0-9.-]+|qwen[0-9a-z./-]*|o[134]-[a-z-]+)['"`]/i;
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? []
  : e.isDirectory() ? walk(join(d, e.name)) : /\.(js|mjs)$/.test(e.name) ? [join(d, e.name)] : []));
const HOME = new Set(['api/lib/model-roles.js', 'api/lib/model-registry.js']);
const LEGACY = new Set(JSON.parse(readFileSync(join(ROOT, 'tests/api/model-literal-legacy.json'), 'utf8')).legacy);
const found = walk(join(ROOT, 'api')).map((f) => relative(ROOT, f)).filter((f) => !f.includes('/migrations/') && !HOME.has(f)
  && MODEL.test(codeOnly(readFileSync(join(ROOT, f), 'utf8')))).sort();

describe('model choices live in model-roles.js', () => {
  it('no NEW file hard-codes a model id', () => {
    const added = found.filter((f) => !LEGACY.has(f));
    if (added.length) throw new Error(`Hard-coded model id in:\n  ${added.join('\n  ')}\nAdd a role to api/lib/model-roles.js and call modelFor().`);
    expect(added).toEqual([]);
  });
  it('the legacy list only shrinks', () => {
    const gone = [...LEGACY].filter((f) => !found.includes(f));
    if (gone.length) throw new Error(`No longer hard-coded — remove from tests/api/model-literal-legacy.json:\n  ${gone.join('\n  ')}`);
    expect(gone).toEqual([]);
  });
});
