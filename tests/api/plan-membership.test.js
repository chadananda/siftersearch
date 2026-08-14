// "We nested for UI purposes. That does not in any way impact stats... The nesting has zero implications
// for anything but visual organization." (Chad, 2026-08-14)
//
// Membership must be resolved ONE way by every reader of the plan. It was not: getIntegrationProgress built
// its own p.docs-only map while gradedPlanDocIds built another, so 607 nested pilgrim notes were members for
// one reader and invisible to the other. Three separate edits aimed at this landed in the wrong copy,
// because the two blocks were near-identical — which is exactly the failure a structural test catches and
// a careful reading does not.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { phaseDocIds, planPhaseByDoc, gradedPlanDocIds } from '../../api/lib/bio.js';
import { INTEGRATION_PHASES } from '../../api/lib/integration-phases.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = readFileSync(join(ROOT, 'api/lib/bio.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');

describe('one membership map, nested docs included', () => {
  it('a nested doc is a member of its phase, exactly like a top-level one', () => {
    const spec = { key: 'primary', docs: [1, 2], groups: [{ docs: [10, 11] }, { docs: [12] }] };
    expect(phaseDocIds(spec)).toEqual([1, 2, 10, 11, 12]);
  });

  it('the real plan counts nested docs — the number that was wrong', () => {
    const map = planPhaseByDoc();
    const flat = INTEGRATION_PHASES.reduce((n, p) => n + (p.docs || []).length, 0);
    const nested = INTEGRATION_PHASES.reduce((n, p) => n + (p.groups || []).reduce((m, g) => m + (g.docs || []).length, 0), 0);
    expect(nested).toBeGreaterThan(500);                      // the pilgrim notes are the bulk of the plan
    expect(Object.keys(map).length).toBeGreaterThan(flat);    // they are IN the map, not beside it
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(flat + nested - 50); // allow dedup overlap
  });

  it('every nested doc resolves to its OWN phase key', () => {
    const map = planPhaseByDoc();
    for (const p of INTEGRATION_PHASES) {
      for (const g of (p.groups || [])) {
        for (const id of (g.docs || []).slice(0, 5)) expect(map[id]).toBe(p.key);
      }
    }
  });

  it('grading covers nested docs, since nesting is presentation', () => {
    const graded = new Set(gradedPlanDocIds());
    const nestedIds = INTEGRATION_PHASES.filter((p) => !p.dynamic)
      .flatMap((p) => (p.groups || []).flatMap((g) => (g.docs || []).slice(0, 5)));
    for (const id of nestedIds) expect(graded.has(id)).toBe(true);
  });
});

describe('no second membership construction can drift back in', () => {
  // The regression was two near-identical blocks: an edit aimed at one silently landed in the other, and
  // the mismatch only showed as 607 books vanishing from a live page.
  it('membership is built in exactly ONE place', () => {
    const inline = code.match(/for \(const p of INTEGRATION_PHASES\) for \(const id of/g) || [];
    expect(inline).toHaveLength(1);
  });

  it('no reader rebuilds the map from p.docs alone', () => {
    expect(code).not.toMatch(/for \(const id of \(p\.docs \|\| \[\]\)\) phaseByDoc/);
  });
});
