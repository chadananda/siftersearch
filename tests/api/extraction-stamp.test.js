// EXTRACTION MUST BE STAMPED PER PARAGRAPH, LIKE EVERY OTHER STAGE.
//
// Disambiguation records context_model; hype records hyp_model; extraction recorded NOTHING. So "has this
// paragraph been through extraction, and with which extractor?" had no answer, and two things followed:
//   1. Completion had to be INFERRED — from entity yield, or from the fact that a later stage ran. Both are
//      wrong. 53 books graded done with zero people because the inference said the pipeline "must have" run.
//   2. An extractor upgrade could not be targeted: with no version on the row there is nothing to compare
//      against, so re-extraction is all-or-nothing across 6.7M paragraphs.
// The stamp is the same fix already applied to disambiguation and hype, and it belongs in the SAME file so a
// fourth definition of "processed" cannot appear (see pipeline/processed.js).
import { describe, it, expect } from 'vitest';
import {
  EXTRACT_DONE_SQL, EXTRACT_THRESHOLD, isExtracted, coverageSelect, PROSE_SQL,
} from '../../api/lib/pipeline/processed.js';
import { isDoneFromArtifacts } from '../../api/lib/pipeline/queue.js';

describe('extraction stamp — the missing version column', () => {
  it('DONE is the stamp, never the yield: a stamped paragraph with no mention is processed', () => {
    expect(isExtracted({ extractModel: 'extract-v2' }, 'extract-v2')).toBe(true);
    expect(isExtracted({ extractModel: null }, 'extract-v2')).toBe(false);
  });

  it('an OLDER extractor version is not done for the current version — that is what makes upgrades targetable', () => {
    expect(isExtracted({ extractModel: 'extract-v1' }, 'extract-v2')).toBe(false);
  });

  it('the SQL predicate measures the stamp column, not entity rows', () => {
    expect(EXTRACT_DONE_SQL).toMatch(/extract_model/);
    expect(EXTRACT_DONE_SQL).not.toMatch(/entity_mentions/);
  });

  it('shares the one coverage bar with the other processing stages', () => {
    expect(EXTRACT_THRESHOLD).toBe(0.98);
  });

  it('coverageSelect exposes an `extracted` count over the SAME live-prose population', () => {
    const sql = coverageSelect(60);
    expect(sql).toMatch(/extracted/);
    // counted over live prose, like every other numerator — not over all rows
    expect(sql).toContain(PROSE_SQL);
  });
});

describe('completion: extraction is a PROCESSING gate', () => {
  const full = { prose: 100, disamb: 100, hyped: 95, hypeable: 100, clusters: 0, decisions: 0 };

  it('a book whose paragraphs were never extracted is NOT done, even at full hype', () => {
    // This is the 53-book case: disambiguated, hyped, zero extraction — previously graded done because
    // hype is stage 9 and "must" imply stages 1-8 ran. A resumed run makes that false.
    expect(isDoneFromArtifacts({ ...full, extracted: 0 }, {})).toBe(false);
  });

  it('a fully extracted book that legitimately yields nobody IS done', () => {
    expect(isDoneFromArtifacts({ ...full, extracted: 100 }, {})).toBe(true);
  });

  it('an only:hype run is still judged on hype alone — the gate applies to runs that include extraction', () => {
    expect(isDoneFromArtifacts({ ...full, extracted: 0 }, { only: 'hype' })).toBe(true);
  });
});

describe('the mentions stage stamps what it READ, not what it yielded', () => {
  // The regression that mattered: a paragraph naming nobody must still be recorded as extracted. If only
  // mention-producing paragraphs were stamped, coverage could never reach the bar on a sparse book and the
  // book would be re-extracted forever — the exact grind the yield-based rule caused.
  const ctxWith = (paras, calls) => ({
    config: { versions: { disambig: 'deepseek-disambig-v1', extract: 'extract-v2' } },
    log: { info: () => {} },
    store: {
      getParagraphs: async () => paras,
      saveMentions: async (m) => m.length,
      markExtracted: async (ids, version) => { calls.push({ ids, version }); },
      getDisambigCoverage: async () => ({ prose: paras.length, disamb: paras.length }),
    },
  });

  it('stamps every paragraph read — including the one with no resolvable name', async () => {
    const { run } = await import('../../api/lib/rag/entities/mentions.js');
    const paras = [
      { id: 11, pid: 'para_1', context: '@Shíráz, ~1844 — "the Báb" = Sayyid ‘Alí-Muḥammad', contextModel: 'deepseek-disambig-v1' },
      { id: 12, pid: 'para_2', context: '', contextModel: 'deepseek-disambig-v1' },   // examined, nobody named
    ];
    const calls = [];
    const stats = await run(ctxWith(paras, calls), 7);
    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual([11, 12]);          // BOTH, not just the productive one
    expect(calls[0].version).toBe('extract-v2');
    expect(stats.stamped).toBe(2);
  });

  it('a dry run stamps nothing — a stamp asserts work that actually happened', async () => {
    const { run } = await import('../../api/lib/rag/entities/mentions.js');
    const calls = [];
    const paras = [{ id: 11, pid: 'para_1', context: '', contextModel: 'deepseek-disambig-v1' }];
    await run(ctxWith(paras, calls), 7, { dryRun: true });
    expect(calls).toHaveLength(0);
  });
});
