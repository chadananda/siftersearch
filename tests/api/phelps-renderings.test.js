import { describe, it, expect } from 'vitest';
import { renderingFile, parseCsv } from '../../scripts/library/phelps-renderings.mjs';

const row = (o) => ({ PIN: 'BH01176', Title: '', 'First line (translated)': 'It is submitted that the noble missive [3.5s]', Translations: '', Language: 'mixed', ...o });

describe('Phelps renderings → library files', () => {
  it('labels provisional, credits the author, splits the glued invocation', () => {
    const r = renderingFile(row(), 'He is God, exalted be His glory, the Mighty!This is submitted: Your esteemed letter arrived like the Egyptian Bashir as a herald of glad tidings.');
    expect(r.body).toMatch(/author: "Bahá'u'lláh"/);
    expect(r.body).toMatch(/translation_authority: "provisional-phelps"/);
    expect(r.body).toMatch(/^He is God, exalted be His glory, the Mighty!\n\{id="para_1"/m);
    expect(r.body).toMatch(/^This is submitted: Your esteemed letter/m);
    expect(r.rel).toBe("Baha'i/Tablet Translations/Stephen Phelps (provisional)/Baha'u'llah/BH01176.md");
  });
  it('skips official translations and unsegmented text', () => {
    expect(renderingFile(row({ Translations: '<a href="http://www.bahai.org/r/442633768">WTAB</a>' }), 'x').skip).toBe('official translation held');
    expect(renderingFile(row(), 'a'.repeat(9000)).skip).toBe('unsegmented');
  });
  it('parses quoted CSV fields', () => {
    expect(parseCsv('PIN,Title\nAB1,"a, ""b""\nc"\n')).toEqual([{ PIN: 'AB1', Title: 'a, "b"\nc' }]);
  });
});
