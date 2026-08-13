// "Processed" must have exactly ONE definition per stage, and it must mean THE WORK WAS DONE — never that
// the work produced output. Both halves have been violated, each costing hours:
//   · disambiguation had FIVE drifting definitions → books stalled at "did not reach verify", 0 model calls.
//   · hype counted `hyp_questions IS NOT NULL` → a paragraph the generator could not handle was
//     indistinguishable from one never attempted, so books that fully completed were re-queued forever.
// We cannot know whether a paragraph HAS a disambiguation to make or a question worth asking, and we will
// not invent either to satisfy a counter — so completion is the stage's VERSION STAMP.
// These are structural tests: they fail the moment someone re-inlines a definition.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DISAMB_DONE_SQL, DISAMB_THRESHOLD, PROSE_SQL, HYPE_DONE_SQL, HYPE_THRESHOLD,
  isDisambiguated, isHyped, meetsDisambBar, meetsHypeBar, coverageSelect,
} from '../../api/lib/pipeline/processed.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
// Comments legitimately NAME a definition (that is how a reader finds the owner); only real code counts.
const code = (p) => src(p).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const DECIDERS = [
  'api/lib/pipeline/queue.js',            // the bound check (may this doc advance?)
  'api/lib/pipeline/plan.js',             // the resume decision (which stage do we restart from?)
  'api/lib/rag/kernel/gate.js',           // the gate (may this stage run at all?)
  'api/lib/rag-adapter/store.js',         // the coverage the gate reads
  'api/lib/rag/enrich/disambiguate.js',   // the disambiguation worker's resume filter
  'api/lib/rag/enrich/retrieval.js',      // the hype worker's resume filter
  'api/lib/pipeline/state.js',
  'api/lib/bio.js',                       // the progress bar — a wrong population misreports health
];

describe('one owner for every stage-completion measure', () => {
  it.each(DECIDERS)('%s inlines no definition of its own', (file) => {
    const s = code(file);
    expect(s, 'inlines `context IS NOT NULL` instead of importing DISAMB_DONE_SQL').not.toMatch(/context IS NOT NULL/);
    expect(s, 'inlines the disambiguation bar instead of importing DISAMB_THRESHOLD').not.toMatch(/\b0\.98\b/);
    // Reading the questions themselves (SELECT hyp_questions … WHERE hyp_questions IS NOT NULL) is fine —
    // it wants rows that have some. COUNTING them as a completion measure is the bug.
    expect(s, 'counts hype OUTPUT instead of importing HYPE_DONE_SQL')
      .not.toMatch(/COUNT\([^)]*\)[\s\S]{0,160}?hyp_questions IS NOT NULL/);
    expect(s, 'inlines the hype bar instead of importing HYPE_THRESHOLD').not.toMatch(/0\.9\s*\*\s*hypeable/);
    expect(s, 'does not import the shared definition').toMatch(/from '[^']*processed\.js'/);
  });
});

describe('disambiguation: processed, not yielded', () => {
  it('an examined-but-empty note is done', () => {
    expect(DISAMB_DONE_SQL).toBe('context IS NOT NULL');
    expect(isDisambiguated({ contextModel: 'v1', context: '' }, 'v1')).toBe(true);
  });
  it('requires the current stamp AND a note', () => {
    expect(isDisambiguated({ contextModel: 'v0', context: 'x' }, 'v1')).toBe(false);
    expect(isDisambiguated({ contextModel: 'v1', context: null }, 'v1')).toBe(false);
  });
  it('clears exactly at the bar', () => {
    expect(DISAMB_THRESHOLD).toBe(0.98);
    expect(meetsDisambBar(98, 100)).toBe(true);
    expect(meetsDisambBar(97, 100)).toBe(false);
  });
});

describe('hype: processed, not yielded', () => {
  const V = 'hype-v3-adaptive';
  it('a stamped paragraph with zero questions is done — no fabricated questions', () => {
    expect(isHyped({ hypModel: V, hyp: '[]' }, V)).toBe(true);
  });
  it('an unattempted paragraph is not done', () => {
    expect(isHyped({ hypModel: null, hyp: null }, V)).toBe(false);
  });
  it('measures the stamp in SQL, not the question column alone', () => {
    expect(HYPE_DONE_SQL).toContain('hyp_model IS NOT NULL');
  });
  it('clears exactly at its own bar, which is not the disambiguation bar', () => {
    expect(HYPE_THRESHOLD).toBe(0.9);
    expect(HYPE_THRESHOLD).not.toBe(DISAMB_THRESHOLD);
    expect(meetsHypeBar(9, 10)).toBe(true);
    expect(meetsHypeBar(8, 10)).toBe(false);
  });
});

describe('the shared population', () => {
  it('counts live prose only, so coverage cannot exceed 100%', () => {
    expect(PROSE_SQL).toContain('deleted_at IS NULL');
    expect(coverageSelect(50)).toContain(PROSE_SQL);
    expect(coverageSelect(50)).toContain(DISAMB_DONE_SQL);
    expect(coverageSelect(50)).toContain(HYPE_DONE_SQL);
  });
  it('nothing to do is never a reason to hold a book back', () => {
    expect(meetsDisambBar(0, 0)).toBe(true);
    expect(meetsHypeBar(0, 0)).toBe(true);
  });
});
