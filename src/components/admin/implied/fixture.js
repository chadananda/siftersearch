// Demo data for /admin/implied?fixture=1 (no API). Mirrors the contract in brief-implied-browser.md; in-memory CRUD. Fixture only — never real numbers.
const DOCS = [
  { title: 'Kitáb-i-Aqdas', author: "Bahá'u'lláh", religion: "Baha'i", collection: 'Core Writings' },
  { title: 'Tablet to Carnegie', author: "'Abdu'l-Bahá", religion: "Baha'i", collection: 'Core Writings' },
  { title: 'Promulgation of Universal Peace', author: "'Abdu'l-Bahá", religion: "Baha'i", collection: 'Talks' },
  { title: 'Sermon on the Mount', author: 'Jesus', religion: 'Christian', collection: 'Gospels' },
  { title: 'Surah Al-Isra', author: 'Muhammad', religion: 'Islam', collection: "Qur'an" },
  { title: 'Dhammapada', author: 'Buddha', religion: 'Buddhist', collection: 'Pali Canon' },
];
const C = ['justice', 'charity', 'social order', 'human dignity', 'education', 'unity', 'stewardship', 'family'];
const mk = (i, d, q, premise, implies, text, proof, concept, status = 'unreviewed', source = 'hype') => ({
  id: 'imp' + i, paraId: 1000 + i, docId: d + 1, question: q, premise, implies, proof, concept, status, source, model: 'haiku-4.5',
  updatedAt: '2026-11-1' + (i % 9), note: '', doc: DOCS[d], link: '#fixture-' + i,
  paragraph: { text, index: i + 3 },
});
let items = [
  mk(1, 0, 'Do the unborn have rights?', 'Inheritance is reserved for the child still in the womb.', 'Personhood and its claims begin before birth.', 'If the deceased leaves a child still in the womb, the share of inheritance is set aside for that child until birth.', 'the share of inheritance is set aside for that child', 'human dignity', 'approved'),
  mk(2, 1, 'What is the purpose of charity?', 'Generosity is a duty that wealth lays upon the rich.', 'Wealth is a trust held for the community, not a private possession.', 'The rich are called to generosity, that the whole body of humanity may be nourished by their means.', 'the whole body of humanity may be nourished', 'charity', 'approved'),
  mk(3, 2, 'What is the source of social order?', 'Religion is the chief instrument of order in the world.', 'Law without faith cannot sustain a civilization.', 'Religion is the chief instrument for the establishment of order in the world and of tranquillity amongst its peoples.', 'chief instrument for the establishment of order', 'social order', 'approved'),
  mk(4, 3, 'Is mercy stronger than retribution?', 'Blessing is given to the merciful, who receive mercy.', 'Justice is completed, not opposed, by mercy.', 'Blessed are the merciful, for they shall obtain mercy; blessed are the peacemakers.', 'Blessed are the merciful', 'justice'),
  mk(5, 4, 'Do parents owe their children education?', 'Kindness to parents is paired with duty toward the young.', 'Raising a child is a public trust, not a private matter.', 'Do not kill your children for fear of poverty; We provide for them and for you.', 'We provide for them and for you', 'education'),
  mk(6, 5, 'Is anger ever justified?', 'Hatred is not appeased by hatred but by love.', 'Retaliation perpetuates the harm it answers.', 'Hatred does not cease by hatred at any time; hatred ceases by love. This is an eternal law.', 'hatred ceases by love', 'unity', 'edited'),
  mk(7, 0, 'Is the earth ours to exploit?', 'The earth is addressed as a trust to be tended.', 'Stewardship precedes ownership.', 'Be anxiously concerned with the needs of the age ye live in, and center your deliberations on its exigencies and requirements.', 'needs of the age ye live in', 'stewardship'),
  mk(8, 2, 'Are women and men equal in capacity?', 'The two wings of a bird must both be strong.', 'A society that holds back half its people cannot rise.', 'The world of humanity has two wings, one is women and the other men. Not until both wings are equally developed can the bird fly.', 'two wings, one is women and the other men', 'human dignity', 'approved'),
  mk(9, 3, 'What makes a family?', 'Love of neighbour extends the household outward.', 'The family is the school of the wider society.', 'You have heard that it was said, Love your neighbour; but I say to you, love even your enemies.', 'love even your enemies', 'family', 'rejected'),
  mk(10, 1, 'Is work a form of worship?', 'Toil done in service of others is accounted as devotion.', 'Economic life has a spiritual dimension.', 'Work done in the spirit of service is worship; it is the noblest of acts.', 'Work done in the spirit of service is worship', 'charity', 'proposed', 'manual'),
];
const REL = ["Baha'i", 'Christian', 'Islam', 'Buddhist'];
const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 14 + i)); const usd = 8 + Math.round(30 * Math.abs(Math.sin(i / 4.2)) + i * 0.8); return { day: d.toISOString().slice(0, 10), usd, paragraphs: usd * 190, questions: usd * 720, implied: usd * 34 }; });
const overview = () => {
  const total = days.reduce((a, d) => a + d.usd, 0);
  const sh = [0.52, 0.22, 0.16, 0.10];
  return {
    asOf: '2026-11-12T06:00:00Z',
    totals: { items: 41873, paragraphs: 1204551, byStatus: { unreviewed: 40012, approved: 1388, edited: 301, rejected: 142, proposed: 30 }, bySource: { hype: 41200, pilot: 640, manual: 33 } },
    byConcept: C.map((concept, i) => ({ concept, n: 9000 - i * 1000 })),
    byReligion: REL.map((religion, i) => ({ religion, items: Math.round(41873 * sh[i]), paragraphs: Math.round(1204551 * sh[i]) })),
    spend: {
      totalUsd: total, hypeUsd: total, impliedShareUsd: total * 0.22,
      byDay: days,
      byReligion: REL.map((religion, i) => ({ religion, usd: total * sh[i], estimated: true, paragraphs: Math.round(1204551 * sh[i]), questions: Math.round(4.2e6 * sh[i]), implied: Math.round(41873 * sh[i]) })),
      byModel: [{ model: 'haiku-4.5', usd: total * 0.9 }, { model: 'sonnet', usd: total * 0.1 }],
      costPerQuestion: total / 4.2e6, costPerImplied: (total * 0.22) / 41873,
      coverage: [{ religion: "Baha'i", hyped: 290000, total: 340000 }, { religion: 'Christian', hyped: 60000, total: 410000 }, { religion: 'Islam', hyped: 33000, total: 220000 }, { religion: 'Buddhist', hyped: 18000, total: 160000 }],
    },
    featured: items.filter((i) => i.status === 'approved'),
  };
};
const match = (it, p) => (!p.status || it.status === p.status) && (!p.concept || it.concept === p.concept) && (!p.religion || it.doc.religion === p.religion) && (!p.text || (it.question + it.premise + it.paragraph.text).toLowerCase().includes(p.text.toLowerCase()));
const find = (id) => items.find((i) => i.id === id);
const hyp = (paraId) => { const imp = items.filter((i) => i.paraId === +paraId); const f = imp[0] || items[0]; return { paragraph: { id: f.paraId, text: f.paragraph.text, index: f.paragraph.index, prev: 'The preceding paragraph sets the scene for this teaching.', next: 'The following paragraph continues the argument.' }, doc: f.doc, stated: [{ q: 'What happens to the inheritance?', a: 'It is held for the child until birth.', deep: false, seeker: false }, { q: 'Who receives the share?', a: 'The unborn child.', deep: true, seeker: true }], implied: imp, thesis: 'Rights attach to the person from the earliest moment.', hypeVersion: 7 }; };
const graph = (p) => {
  const nodes = [], links = [], seen = new Set(), add = (n) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  for (const it of items.filter((i) => match(i, p))) {
    add({ id: 'c:' + it.concept, type: 'concept', label: it.concept, weight: 6 }); add({ id: it.id, type: 'question', label: it.question, status: it.status, religion: it.doc.religion, weight: 3 });
    add({ id: 'p:' + it.paraId, type: 'passage', label: it.doc.title + ' ¶' + it.paragraph.index, religion: it.doc.religion, weight: 1 }); add({ id: 'a:' + it.doc.author, type: 'author', label: it.doc.author, religion: it.doc.religion, weight: 4 });
    links.push({ source: 'c:' + it.concept, target: it.id, type: 'about', weight: 1 }, { source: it.id, target: 'p:' + it.paraId, type: 'answeredBy', weight: 1 }, { source: 'a:' + it.doc.author, target: 'p:' + it.paraId, type: 'wrote', weight: 1 });
  }
  if (p.root) { const r = find(p.root); items.filter((i) => i.id !== p.root && i.concept !== r?.concept).slice(0, 3).forEach((i) => seen.has(i.id) && links.push({ source: p.root, target: i.id, type: 'similar', weight: 0.84 })); }
  return { nodes, links };
};
const edits = [];
const log = (action, before, after, claim_id) => edits.unshift({ id: edits.length + 1, claim_id, action, before, after, note: '', editor: 'fixture', at: new Date().toISOString() });
const words = (s) => s.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
// Returns the JSON the real endpoint would. m = method, path without /api/admin, p = query params, b = body
const scores = new Map(), fold = (q) => String(q ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim(), skey = (pa, q) => pa + '|' + fold(q);
const scoreRows = () => [...scores.values()].sort((a, c) => c.updatedAt.localeCompare(a.updatedAt)).map((s) => ({ ...s, doc: { title: 'Fixture book', author: 'Fixture author' }, link: '#' }));
// myScore on every question-bearing object (items carry paraId + question; editor stated rows take the paragraph from the path)
const annotate = (o, para) => {
  if (Array.isArray(o)) o.forEach((x) => annotate(x, para));
  else if (o && typeof o === 'object') {
    if (typeof o.question === 'string' && o.paraId != null) o.myScore = scores.get(skey(o.paraId, o.question))?.score ?? null;
    else if (typeof o.q === 'string' && o.paraId != null) o.myScore = scores.get(skey(o.paraId, o.q))?.score ?? null;
    else if (typeof o.q === 'string' && para != null && 'a' in o) o.myScore = scores.get(skey(para, o.q))?.score ?? null;
    for (const v of Object.values(o)) if (v && typeof v === 'object') annotate(v, para);
  }
  return o;
};
export function fixtureApi(m, path, p = {}, b = {}) {
  let r;
  if (path === '/implied/score') {
    if (m === 'PUT') { const e = { id: scores.size + 1, paraId: b.paraId, question: b.question, kind: b.kind || 'stated', impliedId: b.impliedId ?? null, score: b.score, tags: b.tags || [], note: b.note || null, rater: 'fixture', updatedAt: new Date().toISOString() }; scores.set(skey(b.paraId, b.question), e); return { score: e }; }
    return { removed: scores.delete(skey(p.paraId, p.question)) ? 1 : 0 };
  }
  if (path === '/implied/scores/stats') {
    const all = [...scores.values()], tags = {}; all.forEach((s) => s.tags.forEach((t) => (tags[t] = (tags[t] || 0) + 1)));
    return { total: all.length, byScore: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, all.filter((s) => s.score === n).length])), byKind: {}, topTags: Object.entries(tags).map(([tag, n]) => ({ tag, n })).sort((x, y) => y.n - x.n), worst: scoreRows().filter((s) => s.score <= 2).slice(0, 10) };
  }
  if (path === '/implied/scores') return { scores: scoreRows().filter((s) => !p.max || s.score <= +p.max), next: null };
  if (path === '/implied/search' || path === '/implied' || path === '/implied/graph' || path.startsWith('/hype/paragraph/') || /^\/implied\/[^/]+$/.test(path)) {
    const out = base(m, path, p, b);
    if (path === '/implied/search' && p.stated) out.hits.push({ score: 0.51, kind: 'stated', stated: { q: 'What concept does this paragraph explain about taxation?', paraId: 1001, docId: 1, doc: { title: 'Fixture book', author: 'Fixture author' }, link: '#' } });
    return annotate(out, (path.match(/^\/hype\/paragraph\/(\d+)$/) || [])[1]);
  }
  return base(m, path, p, b);
}
function base(m, path, p = {}, b = {}) {
  let r;
  if (path === '/implied/overview') return overview();
  if (path === '/implied/graph') return graph(p);
  if (path === '/implied/edits') return { edits };
  if (path === '/implied/search') { const ws = words(p.q || ''); const hits = items.map((it) => ({ it, s: ws.filter((w) => (it.question + ' ' + it.premise + ' ' + it.implies).toLowerCase().includes(w)).length / Math.max(1, ws.length) })).filter((h) => h.s > 0 && match(h.it, p)).sort((a, c) => c.s - h.s).map((h) => ({ score: 0.55 + h.s * 0.4, kind: 'implied', item: h.it })); return { hits }; }
  if (path === '/implied/bulk') { b.ids.forEach((id) => { const it = find(id); if (it) it.status = b.status; }); return { updated: b.ids.length }; }
  if (path === '/implied/import') return { imported: 0, skipped: 0 };
  if ((r = path.match(/^\/implied\/([^/]+)\/similar$/))) return { hits: items.filter((i) => i.id !== r[1]).slice(0, 6).map((item, k) => ({ score: 0.9 - k * 0.05, item })) };
  if ((r = path.match(/^\/hype\/paragraph\/(\d+)\/propose$/))) return { items: [{ ...mk(99, 0, 'Is a promise binding on the powerful?', 'Fulfilling covenants is made a duty of rulers.', 'Authority is bound by its own word.', hyp(r[1]).paragraph.text, 'the share of inheritance', 'justice', 'proposed', 'hype'), id: 'imp99', paraId: +r[1] }], usd: 0.0042 };
  if ((r = path.match(/^\/hype\/paragraph\/(\d+)$/))) return m === 'PUT' ? { ok: true, reindex: 'queued' } : hyp(r[1]);
  if (path === '/implied' && m === 'POST') { const it = { ...mk(items.length + 20, 0, b.question, b.premise, b.implies, 'Fixture paragraph', b.proof, b.concept, 'approved', 'manual'), paraId: b.paraId }; items.unshift(it); log('create', null, it, it.id); return it; }
  if (path === '/implied') { const l = items.filter((i) => match(i, p)); return { items: l, next: null }; }
  if ((r = path.match(/^\/implied\/([^/]+)$/))) {
    const it = find(r[1]); if (!it) throw new Error('not found');
    if (m === 'PATCH') { const before = { ...it }; Object.assign(it, b, { updatedAt: new Date().toISOString().slice(0, 10) }); log('patch', before, { ...it }, it.id); return { item: it, reindex: 'queued' }; }
    if (m === 'DELETE') { log('reject', { status: it.status }, { status: 'rejected' }, it.id); if (p.hard) items = items.filter((i) => i !== it); else it.status = 'rejected'; return { ok: true }; }
    return { ...it, edits: edits.filter((e) => e.claim_id === it.id), paragraph: { ...it.paragraph, prev: 'Previous paragraph text for context.', next: 'Next paragraph text for context.' } };
  }
  throw new Error('fixture: no route ' + path);
}
