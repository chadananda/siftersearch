// The "is this paragraph disambiguated" measure must have exactly ONE definition. It once had five —
// store.js, queue.js, plan.js, gate.js, disambiguate.js — and when they drifted (the worker keyed on a
// version stamp, the measures on the note; the gate sat above the resume bar) books reported
// "did not reach verify" forever with zero model calls. Nothing caught it because nothing asserted the
// copies agreed. These are structural tests: they fail the moment someone re-inlines the definition.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DISAMB_DONE_SQL, DISAMB_THRESHOLD, PROSE_SQL, isDisambiguated, meetsDisambBar, coverageSelect,
} from '../../api/lib/pipeline/disambiguation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
// Comments legitimately NAME the definition (that is how a reader finds the owner); only real code counts.
const code = (p) => src(p).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

// The files that decide whether a stage may run or resume. A literal here is a future stall.
const DECIDERS = [
  'api/lib/pipeline/queue.js',      // the bound check (may this doc advance?)
  'api/lib/pipeline/plan.js',       // the resume decision (which stage do we restart from?)
  'api/lib/rag/kernel/gate.js',     // the gate (may this stage run at all?)
  'api/lib/rag-adapter/store.js',   // the coverage the gate reads
  'api/lib/rag/enrich/disambiguate.js', // the worker's own resume filter
  'api/lib/pipeline/state.js',
  'api/lib/bio.js',                 // the progress bar — a wrong population here misreports health
];

describe('the disambiguation measure has one owner', () => {
  it.each(DECIDERS)('%s inlines neither the SQL nor the threshold', (file) => {
    const s = code(file);
    expect(s, 'inlines `context IS NOT NULL` instead of importing DISAMB_DONE_SQL').not.toMatch(/context IS NOT NULL/);
    expect(s, 'inlines the 0.98 bar instead of importing DISAMB_THRESHOLD').not.toMatch(/\b0\.98\b/);
    expect(s, 'does not import the shared definition').toMatch(/from '[^']*disambiguation\.js'/);
  });
});

describe('the definition itself', () => {
  it('measures PROCESSED, not entity yield — an examined-but-empty paragraph is done', () => {
    expect(DISAMB_DONE_SQL).toBe('context IS NOT NULL');   // NOT `context != ''`
    expect(isDisambiguated({ contextModel: 'v1', context: '' }, 'v1')).toBe(true);
  });

  it('requires both the current version stamp AND a note', () => {
    expect(isDisambiguated({ contextModel: 'v1', context: 'x' }, 'v1')).toBe(true);
    expect(isDisambiguated({ contextModel: 'v0', context: 'x' }, 'v1')).toBe(false); // stale stamp
    expect(isDisambiguated({ contextModel: 'v1', context: null }, 'v1')).toBe(false); // stamp without note
    expect(isDisambiguated(null, 'v1')).toBe(false);
  });

  it('counts live prose only, so coverage cannot exceed 100%', () => {
    expect(PROSE_SQL).toContain('deleted_at IS NULL');
    expect(PROSE_SQL).toContain("blocktype IN ('paragraph','quote')");
    expect(coverageSelect(50)).toContain(PROSE_SQL);
    expect(coverageSelect(50)).toContain(DISAMB_DONE_SQL);
  });

  it('a doc with nothing to disambiguate is not held back forever', () => {
    expect(meetsDisambBar(0, 0)).toBe(true);
  });

  it('clears at the bar exactly — a gate stricter than the resume bar strands every book in the gap', () => {
    expect(meetsDisambBar(98, 100)).toBe(true);
    expect(meetsDisambBar(97, 100)).toBe(false);
    expect(DISAMB_THRESHOLD).toBe(0.98);
  });
});
