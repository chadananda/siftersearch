// The repair must be conservative: fix what is broken, invent nothing, and never touch what already works.
import { describe, it, expect } from 'vitest';
import { repairJsonColumn, parsedOrUndefined } from '../../api/lib/text/repair-json-column.js';

describe('repairJsonColumn', () => {
  it('leaves valid JSON completely alone', () => {
    expect(repairJsonColumn('kinship', '[{"relation":"son","who":"Mírzá Buzurg"}]').changed).toBe(false);
    expect(repairJsonColumn('research_notes', '{"death":{"cause":"martyred"}}').changed).toBe(false);
  });

  it('leaves empty/null alone — the reader already defaults those', () => {
    expect(repairJsonColumn('aliases', '').changed).toBe(false);
    expect(repairJsonColumn('aliases', null).changed).toBe(false);
  });

  it('research_notes prose is preserved under note, and NO death is invented', () => {
    const r = repairJsonColumn('research_notes', 'Identified as the brother of the Báb');
    const v = JSON.parse(r.next);
    expect(v.note).toBe('Identified as the brother of the Báb');
    expect(v.death).toBeUndefined();          // the reader asks for .death — it must stay absent, not guessed
  });

  it('kinship prose becomes an honest unstructured entry, not a fabricated relation', () => {
    const v = JSON.parse(repairJsonColumn('kinship', 'Qájár prince').next);
    expect(v).toHaveLength(1);
    expect(v[0].who).toBe('Qájár prince');
    expect(v[0].relation).toBe('noted');      // NOT 'son'/'father' — kin drives identity; a wrong edge is worse than none
  });

  it('aliases prose becomes a one-entry list', () => {
    expect(JSON.parse(repairJsonColumn('aliases', 'Jináb-i-Munír').next)).toEqual(['Jináb-i-Munír']);
  });

  it('every repair it emits is itself parseable — the fix cannot recreate the bug', () => {
    for (const [col, raw] of [['aliases', 'X'], ['kinship', 'Y "quoted" \\ odd'], ['research_notes', 'Z\nnewline']]) {
      expect(parsedOrUndefined(repairJsonColumn(col, raw).next)).toBeDefined();
    }
  });

  it('refuses columns it does not understand', () => {
    expect(repairJsonColumn('summary', 'whatever').changed).toBe(false);
  });
});
