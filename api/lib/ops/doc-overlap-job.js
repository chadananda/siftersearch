// DOC OVERLAP (Chad 10-21: "Compilation of Compilations has all sub-documents which are mostly duplicates of the Research
// Department compilations we have inside OceanLibrary.com … extract any missing documents and then discard"). Per top-level
// section of each document: how many paragraphs are held word for word (normalized_hash) in another live document, and
// which documents hold them — so the sections NOT held are the ones to extract before the whole is retired. Read only.
// params { ids: [docId], level? (section level to report; default the top level) }
import { paragraphsHeldElsewhere } from '../paragraphs-repo.js';
import { sectionsOf } from '../repos/sections-repo.js';
import { getDoc } from '../docs-repo.js';

/** Pure: sections + held rows → [{ title, start, end, paras, held, share, holders: [[docId, n]] }]. */
export function sectionOverlap(sections, rows, level = null) {
  const lv = level ?? Math.min(...sections.map((s) => s.level));
  return sections.filter((s) => s.level === lv).map((s) => {
    const inS = rows.filter((r) => r.pidx >= s.start_index && r.pidx <= s.end_index);
    const holders = {};
    for (const r of inS) if (r.other) holders[r.other] = (holders[r.other] || 0) + 1;
    const held = inS.filter((r) => r.other).length;
    return { title: s.title, start: s.start_index, end: s.end_index, paras: inS.length, held, share: inS.length ? Math.round((held / inS.length) * 100) / 100 : 0,
      holders: Object.entries(holders).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => [Number(d), n]) };
  });
}

export async function docOverlapJob({ ids = [], level = null } = {}, deps = {}) {
  const { held = paragraphsHeldElsewhere, sections = sectionsOf, doc = getDoc } = deps;
  const out = [];
  for (const id of ids) {
    const [d, rows, secs] = await Promise.all([doc(Number(id), { follow: false, fields: ['id', 'title'] }), held(id), sections(id)]);
    const bySection = secs.length ? sectionOverlap(secs, rows, level) : [];
    out.push({ id: Number(id), title: d?.title, paras: rows.length, held: rows.filter((r) => r.other).length, sections: bySection });
  }
  return { docs: out };
}
