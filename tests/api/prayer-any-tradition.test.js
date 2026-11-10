// Brief A (review 11-09): a prayer is found in ANY tradition — scripture included — by name/incipit or by need; headings and prayer works are
// signals only; wholePrayer bounds the chosen passage; the seeded prayer tree passes validateCandidate. Fake library + fake search, no network.
import { describe, it, expect, afterEach } from 'vitest';
import { findPrayers, wholePrayer } from '../../api/lib/assistant/prayer-find.js';
import { TREE_STRATEGIES, STEPS, TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';
import { validateCandidate } from '../../api/lib/assistant/strategy-design.js';
import { openStrategiesDb, resetStrategiesCache, catalog } from '../../api/lib/repos/strategies-repo.js';
import { canonicalTradition } from '../../api/lib/assistant/tradition-name.js';

const DOCS = [
  { id: 10, title: 'Psalms', collection: 'Bible', religion: 'Christian', paragraph_count: 5 },
  { id: 11, title: 'Book of Common Prayer', collection: 'Liturgy', religion: 'Christian', paragraph_count: 5 },
  { id: 12, title: 'The Gospel of Matthew', collection: 'Bible', religion: 'Christian', paragraph_count: 30 },
  { id: 20, title: "Bahá'í Prayers", collection: 'Prayers', religion: "Baha'i", paragraph_count: 6 },
  { id: 30, title: "The Qur'án", collection: 'Scripture', religion: 'Islam', paragraph_count: 6 },
];
const row = (document_id, paragraph_index, text, extra = {}) => ({ id: document_id * 100 + paragraph_index, document_id, paragraph_index, text,
  religion: DOCS.find((d) => d.id === document_id).religion, title: DOCS.find((d) => d.id === document_id).title, ...extra });
const ROWS = [
  row(10, 0, 'Have mercy upon me, O Lord; for I am weak: O Lord, heal me; for my bones are vexed.'),
  row(11, 0, 'Almighty God, we beseech thee to look upon thy servant and heal him of his sickness, through Jesus Christ our Lord. Amen.'),
  row(12, 8, 'Be not ye therefore like unto them: for your Father knoweth what things ye have need of, before ye ask him.'),
  row(12, 9, 'After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name.', { hype: "What is the Lord's Prayer?" }),
  row(12, 10, 'Thy kingdom come. Thy will be done in earth, as it is in heaven.'),
  row(12, 11, 'Give us this day our daily bread.'),
  row(12, 12, 'And forgive us our debts, as we forgive our debtors.'),
  row(12, 13, 'And lead us not into temptation, but deliver us from evil: For thine is the kingdom, and the power, and the glory, for ever. Amen.'),
  row(12, 14, 'For if ye forgive men their trespasses, your heavenly Father will also forgive you.'),
  row(20, 0, 'For The Departed', { blocktype: 'heading' }),
  row(20, 1, 'O my God! O Thou forgiver of sins, bestower of gifts! Forgive this Thy servant who hath ascended unto Thee, and grant him Thy mercy.', { heading: 'For The Departed' }),
  row(20, 2, "—Bahá'u'lláh"),
  row(20, 3, 'Healing', { blocktype: 'heading' }),
  row(20, 4, 'Thy Name is my healing, O my God, and remembrance of Thee is my remedy.', { heading: 'Healing' }),
  row(30, 0, 'Our Lord, forgive us our sins and remove from us our misdeeds and cause us to die with the righteous.'),
];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").toLowerCase();
const STOP = new Set(['the', 'a', 'an', 'for', 'of', 'to', 'in', 'and', 'what', 'is']);
const stems = (s) => fold(s).split(/[^\p{L}']+/u).map((w) => w.replace(/'s$/, '')).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 4));
// the engine: literal = substring; phrase = every term; hype = a stored question holding the query, else any term (meaning, roughly)
function search(layer, { query, limit = 10, filters = {} }) {
  const q = stems(query);
  const pool = ROWS.filter((r) => (!filters.tradition || canonicalTradition(r.religion) === canonicalTradition(filters.tradition))
    && (filters.documentId == null || [filters.documentId].flat().includes(r.document_id)));
  const scored = pool.map((r) => {
    const words = new Set(stems(r.text));
    if (layer === 'literal_search') return [r, fold(r.text).includes(fold(query)) ? 1 : 0];
    if (layer === 'phrase_search') return [r, q.length && q.every((t) => words.has(t)) ? 1 : 0];
    if (r.hype && fold(r.hype).includes(fold(query))) return [r, 3];
    return [r, q.filter((t) => words.has(t)).length];
  }).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return Promise.resolve({ passages: scored.map(([r, s]) => ({ ...r, score: s })) });
}
const findDocuments = (term, { religion } = {}) => ({ docs: DOCS.filter((d) => d.religion === religion && fold(`${d.title} ${d.collection}`).includes(fold(term))) });
const paragraphsInRange = async (doc, a, b) => ROWS.filter((r) => r.document_id === doc && r.paragraph_index >= a && r.paragraph_index <= b);
const D = { search, findDocuments, paragraphsInRange };

describe('findPrayers: any tradition (brief A)', () => {
  it('Christian "a prayer for healing" → a Psalm or a collect, never Bahá\'í Prayers', async () => {
    const r = await findPrayers({ tradition: 'Christianity', need: 'a prayer for healing' }, D);
    expect(r.tradition).toBe('Christian');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every((c) => c.religion === 'Christian')).toBe(true);
    expect([10, 11]).toContain(r.candidates[0].document_id);
    expect(r.candidates.some((c) => c.title === "Bahá'í Prayers")).toBe(false);
  });

  it('"the Lord\'s Prayer" → Matthew 6:9 by name, and wholePrayer extends it to 6:9-13 (stops at Amen, not 6:8 or 6:14)', async () => {
    const r = await findPrayers({ tradition: 'Christian', name: "the Lord's Prayer" }, D);
    expect(r.candidates[0]).toMatchObject({ document_id: 12, paragraph_index: 9 });
    expect(r.searched[0].how[0]).toMatch(/the name "the Lord's Prayer"/);
    const w = await wholePrayer(r.candidates[0], { paragraphsInRange, sectionsOfDoc: async () => [] });
    expect(w.bound).toBe('contiguous');
    expect(w.rows.map((x) => x.paragraph_index)).toEqual([9, 10, 11, 12, 13]);
  });

  it('Muslim "a du\'a for forgiveness" with no prayer-titled work → a Qur\'án passage', async () => {
    const r = await findPrayers({ tradition: 'Muslim', need: "a du'a for forgiveness" }, D);
    expect(r.tradition).toBe('Islam');
    expect(r.searched[0].works).toEqual([]);
    expect(r.candidates[0]).toMatchObject({ document_id: 30, paragraph_index: 0 });
  });

  it('Bahá\'í "prayer for the departed" is still served: the heading hit becomes its prayer, bounded by the attribution', async () => {
    const r = await findPrayers({ tradition: "Bahá'í", need: 'prayer for the departed' }, D);
    expect(r.candidates[0]).toMatchObject({ document_id: 20, paragraph_index: 1, heading: 'For The Departed' });
    const w = await wholePrayer(r.candidates[0], { paragraphsInRange, sectionsOfDoc: async () => [{ start_index: 0, end_index: 2, paragraphs: 3 }] });
    expect(w.bound).toBe('attribution');
    expect(w.rows.map((x) => x.paragraph_index)).toContain(1);
    expect(w.rows.at(-1).text).toMatch(/Bahá'u'lláh/);
  });

  it('no tradition → several traditions, interleaved; traditions with nothing are dropped', async () => {
    const r = await findPrayers({ need: 'a prayer for forgiveness' }, D);
    const trads = new Set(r.candidates.map((c) => c.tradition));
    expect(trads.size).toBeGreaterThanOrEqual(2);
    expect(r.traditions.map((t) => t.tradition)).not.toContain('Jain');
    expect(new Set(r.candidates.slice(0, 2).map((c) => c.tradition)).size).toBe(2);   // round-robin: two traditions lead
    expect(r.searched.find((s) => s.tradition === 'Jain')).toMatchObject({ found: 0 });
  });

  it('nothing found → the searched record names what was searched, per tradition', async () => {
    const r = await findPrayers({ tradition: 'Jain', need: 'a prayer for rain' }, D);
    expect(r.candidates).toEqual([]);
    expect(r.searched).toEqual([{ tradition: 'Jain', how: ['the need "a prayer for rain" by meaning across Jain'], works: [], found: 0 }]);
  });
});

describe('the prayer tree passes validateCandidate', () => {
  afterEach(() => resetStrategiesCache());
  it('as a designed candidate (new step and template ids), every edge routed', () => {
    resetStrategiesCache({ db: openStrategiesDb(':memory:') });
    const tree = TREE_STRATEGIES.find((s) => s.id === 'prayer');
    const latest = (id) => TEMPLATES.filter((t) => t.id === id).at(-1).text;
    const tid = (id) => id.replace(/^prayer\./, 'prayer_rev.');
    const steps = Object.values(tree.graph.nodes).map((n) => STEPS.find((s) => s.id === n.step)).map((s) => ({ id: s.id.replace('tree.', 'rev.'), activity: s.activity,
      params: s.params.template ? { ...s.params, template: tid(s.params.template) } : s.params }));
    const templates = ['prayer.one', 'prayer.many'].map((id) => ({ id: tid(id), text: latest(id) }));
    const nodes = Object.fromEntries(Object.entries(tree.graph.nodes).map(([k, n]) => [k, { step: n.step.replace('tree.', 'rev.') }]));
    const c = { name: 'prayer_rev', description: tree.description, exemplars: ['a prayer for healing', "the Lord's Prayer"], templates, steps,
      graph: { entry: tree.graph.entry, nodes, edges: tree.graph.edges } };
    const v = validateCandidate(c, { cat: catalog() });
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
});
