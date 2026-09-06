#!/usr/bin/env node
// Encounter-claim survey over the LIVE public API. Answers backlog item 0019 when tower-nas SSH is
// unreachable but the Cloudflare tunnel is up. Deps: none (global fetch, Node 18+).
// Exact whole-table twin, to run on the server: encounter-claim-survey.mjs.
// Non-obvious: GET /entities/{id} returns EVERY supported claim for that entity, so a person sampled
// is a person counted completely — the sample is over PEOPLE, never over one person's claims.

const API = process.env.SIFTER_API || 'https://api.siftersearch.com';
const LIMIT = Number(process.env.SURVEY_PERSONS || 300);        // how many person entities to survey
const OFFSET = Number(process.env.SURVEY_OFFSET || 0);          // rank to start at — >0 probes the tail
const CONCURRENCY = Number(process.env.SURVEY_CONCURRENCY || 4);

// The five relations the backlog item names, plus the surface variants an OPEN extractor vocabulary is
// likely to have invented for the same fact. Kept explicit so the report can state what was looked for
// rather than leaving "no meeting claims" resting on one spelling.
const MEETING_RELATIONS = [
  'met', 'meets', 'met-with', 'meeting', 'encountered', 'encounter',
  'visited', 'visits', 'visited-by',
  'hosted', 'hosts', 'hosted-by', 'received', 'welcomed', 'sheltered',
  'travelled-with', 'traveled-with', 'travelled-to', 'traveled-to', 'accompanied', 'accompanied-by',
  'companion', 'companion-of', 'attended', 'attended-by', 'participated-in',
  'corresponded-with', 'wrote-to', 'sent-to', 'summoned', 'joined', 'followed',
  // Found in production by the first pass and added back: an open vocabulary spells the same fact many ways.
  'knew', 'host-of', 'interviewed-by',
];

// extract-claims-v2.mjs:113 coerces any relation the model invented that is not a key in the `relations`
// table down to 'related-to' — an OPEN producer feeding a CLOSED consumer, the exact shape relations.js
// warns about. But :119 builds `statement` from the RAW relation, so the invented verb survives in the
// prose: "Quddús — traveled-to Shíráz" is stored with relation='related-to'. Recovering it is a regex,
// not a re-extraction. This reads that verb back.
const statementRelation = (statement) => (String(statement || '').match(/\s—\s(\S+)/) || [])[1] || null;

const jget = async (path) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
    if (r.ok) return r.json();
    // 429 is the documented global 100/min ceiling, not a failure — back off rather than lose the row.
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * (attempt + 1))); continue; }
    throw new Error(`${r.status} ${path}`);
  }
  throw new Error(`gave up on ${path}`);
};

// Offset paging (not the faster keyset `after`) because the tail probe has to be able to START at an
// arbitrary rank: the claim-bearing head is only useful as an estimate if the tail is measured too.
const listPersons = async (want, from) => {
  const out = [];
  let total = null;
  while (out.length < want) {
    const page = await jget(`/api/v1/entities?type=person&order=importance&limit=200&offset=${from + out.length}`);
    if (total === null) total = page.total ?? null;
    const rows = page.entities || [];
    if (!rows.length) break;
    out.push(...rows);
  }
  return { total, persons: out.slice(0, want) };
};

const main = async () => {
  const { total: personTotal, persons } = await listPersons(LIMIT, OFFSET);
  process.stderr.write(`person entities in graph: ${personTotal}; sampling ${persons.length}\n`);

  const byRelation = new Map();          // relation -> claim count
  const relationEntities = new Map();    // relation -> Set(entity id)
  const paraPersons = new Map();         // para_id -> Set(person entity id)
  const examples = new Map();            // relation -> up to 3 sample statements
  const perPerson = [];                  // {id,name,importance,claims} — the coverage curve
  const coerced = new Map();             // verb recovered from a related-to statement -> count
  const coercedMeetingExamples = [];
  let claimTotal = 0; let personsWithClaims = 0; let fetched = 0; let mentionRows = 0;
  let coercedTotal = 0; let coercedMeeting = 0;

  const queue = [...persons];
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      let d;
      try { d = await jget(`/api/v1/entities/${p.id}`); } catch { continue; }
      fetched++;
      const claims = d.claims || [];
      if (claims.length) personsWithClaims++;
      claimTotal += claims.length;
      // mentionCount on this dossier IS entity_mentions_v2 (summed per-doc counts, entity-api.js), which
      // is how far the mention substrate outruns the claim substrate — the multiplier on the candidate set.
      mentionRows += Number(d.mentionCount || 0);
      perPerson.push({ id: p.id, name: p.name, importance: p.importance ?? null, claims: claims.length, mentionsV2: Number(d.mentionCount || 0) });
      for (const c of claims) {
        const rel = (c.relation || '(null)').trim();
        byRelation.set(rel, (byRelation.get(rel) || 0) + 1);
        if (!relationEntities.has(rel)) relationEntities.set(rel, new Set());
        relationEntities.get(rel).add(p.id);
        if (c.paraId) {
          if (!paraPersons.has(c.paraId)) paraPersons.set(c.paraId, new Set());
          paraPersons.get(c.paraId).add(p.id);
        }
        if (rel === 'related-to') {
          const sr = statementRelation(c.statement);
          if (sr) {
            coerced.set(sr, (coerced.get(sr) || 0) + 1);
            if (sr !== 'related-to') {
              coercedTotal++;
              if (MEETING_RELATIONS.includes(sr.toLowerCase())) {
                coercedMeeting++;
                if (coercedMeetingExamples.length < 12) coercedMeetingExamples.push({ statement: String(c.statement).slice(0, 160), paraId: c.paraId, source: c.source });
              }
            }
          }
        }
        if (!examples.has(rel)) examples.set(rel, []);
        const ex = examples.get(rel);
        if (ex.length < 3 && c.statement) ex.push({ statement: String(c.statement).slice(0, 180), paraId: c.paraId, source: c.source });
      }
      if (fetched % 25 === 0) process.stderr.write(`  ${fetched}/${persons.length} people, ${claimTotal} claims\n`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Co-occurrence: paragraphs where two or more DISTINCT sampled person entities are each attested.
  let coocParas = 0; let coocPairInstances = 0;
  const coocHist = new Map();
  for (const [, set] of paraPersons) {
    const n = set.size;
    coocHist.set(n, (coocHist.get(n) || 0) + 1);
    if (n >= 2) { coocParas++; coocPairInstances += (n * (n - 1)) / 2; }
  }

  const relations = [...byRelation.entries()]
    .map(([relation, claims]) => ({
      relation,
      claims,
      entities: relationEntities.get(relation).size,
      meeting: MEETING_RELATIONS.includes(relation.toLowerCase()),
      examples: examples.get(relation) || [],
    }))
    .sort((a, b) => b.claims - a.claims);

  const meeting = relations.filter((r) => r.meeting);
  perPerson.sort((a, b) => b.claims - a.claims);
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    api: API,
    scope: {
      note: 'sample over PEOPLE (top-N by importance); every claim of every sampled person is counted',
      personEntitiesInGraph: personTotal,
      rankRange: `importance rank ${OFFSET + 1}..${OFFSET + persons.length} of ${personTotal}`,
      personsSampled: persons.length,
      personsFetched: fetched,
      personsWithClaims,
    },
    claimTotal,
    // target_entity_id is NOT serialisable here: the fastify response schema for /entities/{id} omits it,
    // so counting object edges from this surface would report a hard 0 that is the API's, not the data's.
    // The exact figure comes from encounter-claim-survey.mjs. (people.js records 392/1508 on Quddús.)
    claimsWithObjectId: 'not exposed by /entities/{id} — see encounter-claim-survey.mjs',
    distinctRelations: relations.length,
    relations,
    claimsPerPerson: { top: perPerson.slice(0, 25), tail: perPerson.slice(-10) },
    // The open-producer/closed-consumer loss, measured. See statementRelation() above.
    coercedToRelatedTo: {
      relatedToClaims: byRelation.get('related-to') || 0,
      carryingAMoreSpecificVerbInTheStatement: coercedTotal,
      ofThoseAMeetingRelation: coercedMeeting,
      recoveredVerbs: [...coerced.entries()]
        .filter(([v]) => v !== 'related-to')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([verb, n]) => ({ verb, claims: n, meeting: MEETING_RELATIONS.includes(verb.toLowerCase()) })),
      meetingExamples: coercedMeetingExamples,
    },
    meetingRelations: {
      lookedFor: MEETING_RELATIONS,
      found: meeting.map((r) => ({ relation: r.relation, claims: r.claims, entities: r.entities })),
      claimTotal: meeting.reduce((s, r) => s + r.claims, 0),
    },
    coOccurrence: {
      basis: 'claim para_id (public API). entity_mentions_v2 is broader — see encounter-claim-survey.mjs',
      entityMentionsV2RowsForSampledPersons: mentionRows,
      mentionToClaimRatio: claimTotal ? Number((mentionRows / claimTotal).toFixed(2)) : null,
      distinctParagraphs: paraPersons.size,
      paragraphsWithTwoOrMorePersons: coocParas,
      personPairInstances: coocPairInstances,
      histogram: [...coocHist.entries()].sort((a, b) => a[0] - b[0]).map(([n, paras]) => ({ personsInParagraph: n, paragraphs: paras })),
    },
  }, null, 2)}\n`);
};

main().catch((e) => { process.stderr.write(`${e?.stack || e}\n`); process.exit(1); });
