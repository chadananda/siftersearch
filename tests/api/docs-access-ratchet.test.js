// A RATCHET on raw document access, so the problem cannot regrow while the migration proceeds.
//
// Chad, 2026-08-25: "We're relying on you remembering all the rules every time. Instead we should be
// developing and extending a robust API with all such rules baked in."
//
// A rule nobody enforces is a rule someone forgets, and the incident record is what forgetting cost: a
// dedupe pass soft-deleted 155 canonical documents; reconcileDeletes emptied 20 more (14,588 paragraphs)
// unnoticed for two months; four canonicals were suppressed behind `duplicate_of` pointers aimed at EMPTY
// shells. Every one of those was a call site that wrote its own document SQL.
//
// WHY A RATCHET AND NOT A BAN: there are 382 raw `FROM docs` queries across 127 files. Failing on all of
// them would mean a permanently red test, and a permanently red test is deleted or skipped within a week —
// so it would protect nothing. A ratchet fails only on an INCREASE, which makes the current state visible,
// makes every migration show up as progress, and blocks new violations from the moment it lands.
//
// To migrate a file: use `api/lib/docs-repo.js` (or `/api/admin/docs*`) and LOWER the number below.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');

// The sanctioned owners of document SQL. docs-repo IS the interface; canonical-integrity is the invariant
// detector that must read the raw shape to find defects in it; content.js holds the guarded write chokepoint.
const OWNERS = new Set([
  'api/lib/docs-repo.js',
  'api/lib/canonical-integrity.js',
  'api/lib/content.js',
]);

/**
 * MEASURED 2026-08-26. Lower this as files migrate; never raise it.
 *
 * If this test fails because you added a raw document query, the fix is not to bump the number — it is to
 * ask whether docs-repo should be extended, which is the question Chad asked us to start asking.
 */
const MAX_RAW_DOC_QUERIES = 382;

/**
 * Hard deletes that are permitted, each named so a NEW one cannot hide among them.
 *
 *   admin.js            — the explicit operator purge endpoint. Guarded by purgeSafety(): refuses a
 *                         canonical holding live prose, or one other docs depend on, unless force=true.
 *   ingester/lookup.js  — reaps rows ALREADY soft-deleted past a retention window. Nothing recoverable is
 *                         lost, because the recoverable window has expired by definition.
 *   fix-production-db.js · cleanup-duplicates.js — one-off historical repair scripts, not live paths.
 *
 *   ⚠ resegment-needed.js — DELETES a doc and its content so the ingester recreates them. If the re-ingest
 *     fails after the delete, the book is gone permanently. This is a real hazard, listed rather than
 *     rewritten because changing a re-ingest workflow unverified could break resegmentation outright.
 *     FLAGGED FOR REVIEW: soft-delete-then-recreate would be equally effective and reversible.
 */
const SANCTIONED_HARD_DELETES = new Set([
  'api/routes/admin.js',
  'api/services/ingester/lookup.js',
  'scripts/fix-production-db.js',
  'scripts/cleanup-duplicates.js',
  'scripts/resegment-needed.js',
]);

/**
 * Strip comments before scanning. A comment describing a pattern is not an instance of it — the first
 * version of this test flagged a comment that documented the very hard-delete it had just replaced, which
 * would have taught the next reader that the check cries wolf.
 */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')     // block comments
  .replace(/(^|[^:])\/\/.*$/gm, '$1');  // line comments (the [^:] keeps http:// intact)

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e)) out.push(p);
  }
  return out;
};

function countRawDocQueries() {
  const hits = {};
  let total = 0;
  for (const base of ['api', 'scripts', 'worker']) {
    let files = [];
    try { files = walk(join(ROOT, base)); } catch { continue; }
    for (const f of files) {
      const rel = relative(ROOT, f);
      // Migrations legitimately speak raw schema — that is their entire job.
      if (OWNERS.has(rel) || rel.includes('/migrations/')) continue;
      const n = (codeOnly(readFileSync(f, 'utf-8')).match(/FROM\s+docs\b/gi) || []).length;
      if (n) { hits[rel] = n; total += n; }
    }
  }
  return { total, hits };
}

describe('raw document access is ratcheted, not permitted', () => {
  it(`does not exceed ${MAX_RAW_DOC_QUERIES} raw \`FROM docs\` queries outside docs-repo`, () => {
    const { total, hits } = countRawDocQueries();
    if (total > MAX_RAW_DOC_QUERIES) {
      const worst = Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([f, n]) => `  ${f}: ${n}`).join('\n');
      throw new Error(
        `Raw document queries rose to ${total} (ceiling ${MAX_RAW_DOC_QUERIES}).\n` +
        `A new call site is deriving "which documents count" for itself — the pattern that soft-deleted 155 ` +
        `canonicals and hid four more behind empty shells.\n` +
        `Use api/lib/docs-repo.js (scopes: live · canonical · withProse · canonicalWithProse · all), or ` +
        `extend it if it cannot express your query.\nHeaviest files:\n${worst}`,
      );
    }
    expect(total).toBeLessThanOrEqual(MAX_RAW_DOC_QUERIES);
  });

  it('keeps the destructive paths on the guarded interface', () => {
    // These four could lose a book. They were migrated on 2026-08-26 and must not regress: each previously
    // wrote `deleted_at`/`duplicate_of` directly, with no last-copy check and no check that the target of a
    // duplicate pointer holds any prose at all.
    for (const rel of ['scripts/dedup-library.mjs', 'scripts/dedupe-by-title.js',
      'scripts/dedupe-ol-canonical.mjs', 'api/services/sites-ingester.js']) {
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      expect(src, `${rel} must use docs-repo for destructive document changes`).toMatch(/docs-repo/);
    }
  });

  it('never hard-deletes a document row', () => {
    // Soft delete is what made the June restore possible at all: 14,588 paragraphs came back because the
    // rows were still there. A DELETE FROM docs forecloses that.
    for (const base of ['api', 'scripts', 'worker']) {
      let files = [];
      try { files = walk(join(ROOT, base)); } catch { continue; }
      for (const f of files) {
        const rel = relative(ROOT, f);
        if (rel.includes('/migrations/')) continue;
        if (SANCTIONED_HARD_DELETES.has(rel)) continue;
        const src = codeOnly(readFileSync(f, 'utf-8'));
        expect(src, `${rel} hard-deletes document rows`).not.toMatch(/DELETE\s+FROM\s+docs\b/i);
      }
    }
  });
});
