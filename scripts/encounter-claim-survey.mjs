#!/usr/bin/env node
// Exact whole-table encounter-claim survey. Backlog item 0019. RUN ON tower-nas — a workstation copy of
// sifter.db is stale and will read as "nothing there". Deps: better-sqlite3, data/sifter.db. Read-only.
//   ssh chad@tower-nas 'cd ~/sifter/siftersearch && node scripts/encounter-claim-survey.mjs' > survey.json
// The API twin (encounter-claim-survey-api.mjs) samples the top-N people through the public endpoint and
// cannot see target_entity_id or entity_mentions_v2 at all; this one is the authority for both.

import Database from 'better-sqlite3';
import path from 'node:path';

const DB = process.env.SIFTER_DB || path.join(process.cwd(), 'data', 'sifter.db');
const db = new Database(DB, { readonly: true, fileMustExist: true });

// Same list the API twin uses, so the two reports are comparable line for line.
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
const ph = MEETING_RELATIONS.map(() => '?').join(',');

// ── 1. every distinct relation in entity_claims, with counts ────────────────────────────────────────
// No WHERE on status: a claim the pipeline retracted still tells you the extractor emitted that relation,
// which is the question. `supported` is broken out so both readings are on the page.
const relations = db.prepare(`
  SELECT relation,
         COUNT(*)                                                             AS claims,
         SUM(CASE WHEN status IS NULL OR status='supported' THEN 1 ELSE 0 END) AS supported,
         COUNT(DISTINCT entity_id)                                            AS entities,
         SUM(CASE WHEN target_entity_id IS NOT NULL THEN 1 ELSE 0 END)        AS objectEdges,
         COUNT(DISTINCT para_id)                                              AS paragraphs
    FROM entity_claims
   GROUP BY relation
   ORDER BY claims DESC`).all();

const totals = db.prepare(`
  SELECT COUNT(*) AS claims, COUNT(DISTINCT relation) AS relations, COUNT(DISTINCT entity_id) AS entities,
         SUM(CASE WHEN target_entity_id IS NOT NULL THEN 1 ELSE 0 END) AS objectEdges
    FROM entity_claims`).get();

// ── 2. meeting-type claims: do they exist, and how many ─────────────────────────────────────────────
const meeting = db.prepare(`
  SELECT relation, COUNT(*) AS claims, COUNT(DISTINCT entity_id) AS entities,
         SUM(CASE WHEN target_entity_id IS NOT NULL THEN 1 ELSE 0 END) AS objectEdges
    FROM entity_claims
   WHERE LOWER(relation) IN (${ph})
   GROUP BY relation ORDER BY claims DESC`).all(MEETING_RELATIONS);

// A meeting claim is only an ENCOUNTER EDGE when both ends are people. Everything else names the other
// party in prose only — the same gap people.js already documents for events and places.
const meetingPersonToPerson = db.prepare(`
  SELECT ec.relation, COUNT(*) AS claims
    FROM entity_claims ec
    JOIN graph_entities s ON s.id = ec.entity_id        AND s.entity_type='person'
    JOIN graph_entities o ON o.id = ec.target_entity_id AND o.entity_type='person'
   WHERE LOWER(ec.relation) IN (${ph})
   GROUP BY ec.relation ORDER BY claims DESC`).all(MEETING_RELATIONS);

// ── 2b. the relations that were COERCED AWAY, and are still recoverable ─────────────────────────────
// extract-claims-v2.mjs:113 rewrites any relation the model invented that is not a key in `relations`
// down to 'related-to' — an OPEN producer feeding a CLOSED consumer, the shape relations.js warns about.
// :119 builds `statement` from the RAW relation, so the invented verb survives in the prose:
// "Quddús — traveled-to Shíráz" is stored with relation='related-to'. Recovering it is a regex over a
// column we already have, not a re-extraction. This counts what is sitting there.
const relatedTo = db.prepare(
  "SELECT statement FROM entity_claims WHERE relation='related-to' AND statement IS NOT NULL").all();
const verbOf = (s) => (String(s).match(/\s—\s(\S+)/) || [])[1] || null;
const recovered = new Map();
let coercedTotal = 0; let coercedMeeting = 0;
for (const r of relatedTo) {
  const v = verbOf(r.statement);
  if (!v || v === 'related-to') continue;
  coercedTotal++;
  recovered.set(v, (recovered.get(v) || 0) + 1);
  if (MEETING_RELATIONS.includes(v.toLowerCase())) coercedMeeting++;
}

// ── 3. paragraph co-occurrence of two PERSON entities in entity_mentions_v2 ─────────────────────────
// The candidate set for encounter extraction: a paragraph naming two people is where an encounter can be
// asserted. Costed as a histogram, because "how many paragraphs hold exactly 2 / 3 / 4+ people" is what
// decides whether a targeted re-analysis is cheap.
const cooc = db.prepare(`
  WITH pp AS (
    SELECT m.doc_id, m.para_id, COUNT(DISTINCT m.entity_id) AS persons
      FROM entity_mentions_v2 m
      JOIN graph_entities ge ON ge.id = m.entity_id AND ge.entity_type='person'
     WHERE m.entity_id IS NOT NULL AND m.para_id IS NOT NULL
     GROUP BY m.doc_id, m.para_id)
  SELECT persons, COUNT(*) AS paragraphs, SUM(persons*(persons-1)/2) AS personPairs
    FROM pp GROUP BY persons ORDER BY persons`).all();

const coocTotals = cooc.reduce((a, r) => ({
  paragraphsWithAnyPerson: a.paragraphsWithAnyPerson + r.paragraphs,
  paragraphsWithTwoOrMorePersons: a.paragraphsWithTwoOrMorePersons + (r.persons >= 2 ? r.paragraphs : 0),
  personPairInstances: a.personPairInstances + (r.persons >= 2 ? r.personPairs : 0),
}), { paragraphsWithAnyPerson: 0, paragraphsWithTwoOrMorePersons: 0, personPairInstances: 0 });

const mentionTotals = db.prepare(
  'SELECT COUNT(*) AS mentions, COUNT(DISTINCT para_id) AS paragraphs, COUNT(DISTINCT entity_id) AS entities FROM entity_mentions_v2').get();
const corpusParagraphs = db.prepare('SELECT COUNT(*) AS n FROM content WHERE deleted_at IS NULL').get();

// How many of those two-person paragraphs ALREADY carry a meeting claim — the part that would be
// re-extracted for nothing.
const alreadyClaimed = db.prepare(`
  WITH pp AS (
    SELECT m.doc_id, m.para_id
      FROM entity_mentions_v2 m
      JOIN graph_entities ge ON ge.id = m.entity_id AND ge.entity_type='person'
     WHERE m.entity_id IS NOT NULL AND m.para_id IS NOT NULL
     GROUP BY m.doc_id, m.para_id HAVING COUNT(DISTINCT m.entity_id) >= 2)
  SELECT COUNT(*) AS n FROM pp
   WHERE EXISTS (SELECT 1 FROM entity_claims ec
                  WHERE ec.para_id = pp.para_id AND ec.doc_id = pp.doc_id
                    AND LOWER(ec.relation) IN (${ph}))`).get(MEETING_RELATIONS);

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  db: DB,
  entityClaims: { ...totals, byRelation: relations },
  meetingRelations: {
    lookedFor: MEETING_RELATIONS,
    found: meeting,
    claimTotal: meeting.reduce((s, r) => s + r.claims, 0),
    objectEdgeTotal: meeting.reduce((s, r) => s + r.objectEdges, 0),
    personToPersonEdges: meetingPersonToPerson,
  },
  coercedToRelatedTo: {
    relatedToClaims: relatedTo.length,
    carryingAMoreSpecificVerbInTheStatement: coercedTotal,
    ofThoseAMeetingRelation: coercedMeeting,
    recoveredVerbs: [...recovered.entries()].sort((a, b) => b[1] - a[1])
      .map(([verb, claims]) => ({ verb, claims, meeting: MEETING_RELATIONS.includes(verb.toLowerCase()) })),
  },
  coOccurrence: {
    basis: 'entity_mentions_v2 joined to graph_entities.entity_type = person, grouped by (doc_id, para_id)',
    mentionTotals,
    corpusParagraphs: corpusParagraphs.n,
    histogram: cooc,
    ...coocTotals,
    twoPersonParagraphsAlreadyCarryingAMeetingClaim: alreadyClaimed.n,
  },
}, null, 2)}\n`);
db.close();
