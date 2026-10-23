// ol-refresh planner: rows matched to export blocks by ilm_id, in place (api/lib/ops/ol-refresh-job.js — Chad 10-23).
import { describe, it, expect } from 'vitest';
import { planOlBook, olRefreshJob } from '../../api/lib/ops/ol-refresh-job.js';
import { parseExport } from '../../api/lib/library/ol-display-ids.js';

const LONG = 'and a long paragraph of content that runs on for many words so it is plainly a paragraph and never a lead-in line, since a lead-in is a short salutation or invocation of thirty words or fewer';
const exportText = `---\nbookid: "t_en"\n---\n\n${[
  '### Part {id="h" type="header"}',
  `O Son of Spirit! {id="31" num="a1" type="par"}`,
  `My first counsel ${LONG} {id="32" type="par"}`,
  `Second ${LONG} {id="33" num="1.2" type="par"}`,
  `Third ${LONG} {id="34" num="1.2" type="par"}`,
  `Fresh block ${LONG} {id="35" num="2" type="par"}`,
].join('\n\n')}\n`;
const row = (id, text, attrs, ext) => ({ id, text, blocktype: 'paragraph', external_para_id: ext, block_attrs: JSON.stringify(attrs) });

describe('planOlBook', () => {
  it('keeps row ids, merges an address+body row, withholds content collisions, reports adds/removes/changes', () => {
    const { blocks } = parseExport(exportText);
    const rows = [
      row(10, `O Son of Spirit!\nMy first counsel ${LONG}`, { ilm_id: '32', pn: 'Arabic 1' }, 'para_3'),
      row(11, `Second ${LONG}`, { ilm_id: '33' }, 'para_4'),
      row(12, `Third, edited ${LONG}`, { ilm_id: '34' }, 'para_5'),
      row(13, 'Gone paragraph', { ilm_id: '99' }, 'para_9'),
      { id: 14, text: 'a note', blocktype: 'footnote', block_attrs: null },
    ];
    const p = planOlBook(blocks, rows);
    expect(p.counts).toMatchObject({ matched_exact: 1, matched_merged: 1, text_changed: 1, removed: 1, footnotes: 1, pn_changed: 1, withheld_dup: 2 });
    expect(p.counts.added.content).toBe(1);
    expect(p.changes.find((c) => c.id === 10)).toMatchObject({ pn: 'a1', cite: true, was: 'Arabic 1' });
    expect(p.changes.find((c) => c.id === 11)).toMatchObject({ pn: '1.2', cite: false });
    expect(p.dup_ids).toEqual(['1.2']);
    expect(p.atRisk.sort()).toEqual([12, 13]);
    expect(p.status).toBe('text-changed');
  });
});

describe('olRefreshJob', () => {
  it('refuses write mode until the dry run is approved', async () => {
    await expect(olRefreshJob({ dry: false })).rejects.toThrow(/not enabled/);
  });
});

import { classifyNewBook } from '../../api/lib/ops/ol-refresh-job.js';
describe('classifyNewBook', () => {
  it('imports catalogued books, holds uncatalogued ones, never imports drafts', () => {
    expect(classifyNewBook({ bookid: 'nehemiah-ot_en', title: 'Nehemiah', paragraphs: 287 }, { inCatalog: true }).action).toBe('import');
    expect(classifyNewBook({ bookid: 'lights_of_guidance_baha_i_ocean_en', title: 'Lights of Guidance', paragraphs: 7798 }, { inCatalog: false }).action).toBe('hold');
    expect(classifyNewBook({ bookid: 'arem_sprint_159', title: 'Arem 09.2023', paragraphs: 253 }, { inCatalog: true }).action).toBe('junk');
    expect(classifyNewBook({ bookid: 'the_brothers_karamazov_ffa_en', title: 'Copy-The Kitáb-I-Íqán 06.08', paragraphs: 292 }).action).toBe('junk');
    expect(classifyNewBook({ bookid: 'test_taoism_part_ii_en', title: 'The Texts of Taoism Part II', paragraphs: 764 }, { inCatalog: true }).action).toBe('import');
    expect(classifyNewBook({ bookid: 'dawn_breakers_temporary_copy_en', title: 'The Dawn-Breakers', paragraphs: 1248 }, { inCatalog: false }).action).toBe('junk');
    expect(classifyNewBook({ bookid: 'x', title: 'Messages to Canada', paragraphs: 3156 }, { secondCopyOf: 21311 }).action).toBe('junk');
    expect(classifyNewBook({ bookid: 'omal', title: 'A Dog’s Tale', paragraphs: 0 }).action).toBe('junk');
  });
});
