// Anis findings contract (PRD F3): what research found, as TYPED findings — never prose — so code and Jev can filter,
// choose a format and keep kinds of authority apart. Each finding: { id, kind, status, authority, citations }.
//   kind: text_shows (a passage) | documented (a cited record: who met whom, with proof) | absence (nothing found)
//   status: verified (checked against its proof) | hedged (unchecked) | disputed (sources disagree)
//   authority: the passage's class (companion/authority.js) — scripture, interpretation, guidance, history, …
// dataProfile() summarises the findings for the format choice (formats.js). Pure. Deps: companion/authority.
import { classifyAuthority } from '../companion/authority.js';

// Short reader-facing names for the authority classes (house style: keep kinds of authority distinct).
export const AUTHORITY_SHORT = {
  B1_REVEALED: 'scripture', B2_AUTH_INTERPRETATION: 'authorized interpretation', B3_UHJ_GUIDANCE: 'institutional guidance',
  B4_OFFICIAL_EXPOSITORY: 'exposition', H1_PRIMARY_HISTORY: 'history (primary account)', H2_SCHOLARSHIP: 'scholarship',
  I1_TRADITION_PRIMARY: 'scripture of its tradition', I2_TRADITION_SCHOLARSHIP: 'commentary', G_GENERAL: 'reference',
};

const yearOf = (w) => { const m = String(w ?? '').match(/\b(1[0-9]{3}|[2-9][0-9]{2})\b/); return m ? Number(m[1]) : null; };

/** Passages + people record → typed findings. */
export function toFindings({ retrieved = [], peopleAnswer = null, entities = null } = {}) {
  const out = retrieved.map((q, i) => {
    const cls = classifyAuthority({ author: q.source_author, title: q.source_title, collection: q.collection, religion: q.religion });
    return { id: `p${i + 1}`, kind: 'text_shows', status: 'verified', authority: { class: cls, name: AUTHORITY_SHORT[cls] || 'reference' },
      religion: q.religion || null, author: q.source_author || null, lang: q.source_lang || null,
      citations: [{ title: q.source_title, url: q.citation_url, doc_id: q.doc_id, paragraph_index: q.paragraph_index }] };
  });
  const person = (p, status) => ({ id: `e${p.id ?? p.name}`, kind: 'documented', status, person: p.name,
    dates: (p.evidence || []).map((e) => yearOf(e.when)).filter(Boolean),
    citations: (p.evidence || []).map((e) => ({ statement: e.statement, proof: e.proof || null, doc_id: e.doc_id ?? null, url: e.url ?? null })) });
  if (peopleAnswer) {
    for (const p of entities || []) out.push(person(p, (p.evidence || []).some((e) => e.verified === 'met') ? 'verified' : 'hedged'));
    for (const p of peopleAnswer.notMet || []) out.push({ ...person(p, 'verified'), denies: true });
    for (const p of peopleAnswer.contested || []) out.push(person(p, 'disputed'));
  } else {
    for (const p of entities || []) out.push(person(p, 'hedged'));
  }
  if (!out.length) out.push({ id: 'none', kind: 'absence', status: 'verified', citations: [] });
  return out;
}

/** What the evidence looks like — the format choice reads the question AND this, never the question alone. */
export function dataProfile(findings = [], { plan = null, question = '' } = {}) {
  const passages = findings.filter((f) => f.kind === 'text_shows');
  const documented = findings.filter((f) => f.kind === 'documented');
  const dates = [...new Set(documented.flatMap((f) => f.dates))].sort();
  return {
    passages: passages.length,
    authors: new Set(passages.map((f) => f.author).filter(Boolean)).size,
    traditions: new Set(passages.map((f) => f.religion).filter(Boolean)).size,
    authorityKinds: new Set(passages.map((f) => f.authority.class)).size,
    people: documented.length,
    denied: documented.filter((f) => f.denies).length,
    disputed: documented.filter((f) => f.status === 'disputed').length,
    dates: dates.length,
    hasOriginal: passages.some((f) => f.lang && !/^en/i.test(f.lang)),
    absence: findings.length === 1 && findings[0].kind === 'absence',
    comparative: !!plan?.comparative,
    shape: plan?.shape || null,
    words: String(question || '').split(/\s+/).filter(Boolean).length,
  };
}

/** One line per profile field that matters — the Jev state and the path log. */
export function describeProfile(p) {
  return [`${p.passages} passages from ${p.authors} authors in ${p.traditions} traditions, ${p.authorityKinds} kinds of authority`,
    p.people ? `a cited people record: ${p.people} people (${p.denied} denied, ${p.disputed} disputed), ${p.dates} distinct dates` : null,
    p.hasOriginal ? 'includes original-language text' : null, p.absence ? 'NOTHING was found' : null,
    p.comparative ? 'the question compares traditions' : null, p.shape ? `question shape: ${p.shape}` : null].filter(Boolean).join('; ');
}
