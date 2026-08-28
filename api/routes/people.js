// Official public People API — criteria search + person master/detail. Part of /api/v1.
// Backed by the shared bio data layer (api/lib/bio.js), so it shares one source of truth with the
// biography browser's internal /api/graph/bio/* endpoints.
//
//   GET /api/v1/people                 — list/search people by criteria
//     q=<text>            name / alias / kin token match (transliteration-folded)
//     side=<Bábí|Bahá'í|opponent|other>
//     book=<gpb,dawn-breakers>         comma-separated source-book keys (OR)
//     portrait=1                       only people with a portrait
//     min_importance=<0-100>
//     sort=importance|name             default importance
//     limit=<1-200> (default 50)  offset=<n>
//   GET /api/v1/people/:id             — full dossier (relationships, GPB citations, cross-corpus reach)
import { listBioPersons, getBioPerson, bioSearch, getIntegrationProgress } from '../lib/bio.js';
import { queryAll } from '../lib/db.js';
import { Readable } from 'node:stream';
import { entityLookup, entityDossier, entitySearch } from '../lib/entity-api.js';
import { listEntities, exportEntities, resolveKeys, changesSince, graphVersion, naturalKey, ENTITY_FIELDS } from '../lib/entity-catalog.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ]/g, '').toLowerCase();
const toks = (s) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);


// ── OpenAPI schemas ───────────────────────────────────────────────────────────────────────────────────────
// These routes carried NO schema until 2026-08-28, so the served spec showed zero parameters and a bare
// "Default Response" for the whole entity graph. An agent asked "who was at the Badasht Conference" could not
// see that `q` exists or that evidence carries relation/statement/source/paraId, so it guessed — and guessed
// passage search, which quotes text but cannot enumerate people. The contract below is the fix; the contract
// test in tests/api/openapi-entities-contract.test.js asserts it stays served.
const EVIDENCE = {
  type: 'object',
  description: 'One CITED claim supporting this person’s link to the query. Always verify via proof/paraId.',
  properties: {
    relation: { type: 'string', description: 'The edge type: participated-in, visited, hosted, died, met, accompanied, related-to, teacher-of, characterized-as, …. THIS is what you filter on to answer "who was at X".', example: 'participated-in' },
    statement: { type: 'string', description: 'The claim in one line, subject — relation — object.', example: 'Quddús — participated-in Badasht conference' },
    source: { type: 'string', nullable: true, description: 'Title of the book the claim was extracted from.', example: 'The Dawn-Breakers' },
    sourceAbbr: { type: 'string', nullable: true, description: 'Short form of the source title (DB, GPB).', example: 'DB' },
    paraId: { type: 'string', nullable: true, description: 'Paragraph id of the proof span — pass to GET /api/v1/paragraph/{id} to quote it.', example: 'p16114536' },
    url: { type: 'string', nullable: true, description: 'Deep link to the cited paragraph, when the source book is published online.' },
    score: { type: 'integer', description: 'Match strength; exact phrase outranks scattered terms.' },
  },
};
const PERSON_HIT = {
  type: 'object',
  properties: {
    id: { type: 'integer', description: 'Entity id. NOT durable across a full rebuild — see GET /entities/capabilities and use `key` for storage.' },
    name: { type: 'string', example: 'Quddús' },
    importance: { type: 'number' },
    score: { type: 'integer', description: 'Best evidence score for this person.' },
    evidence: { type: 'array', items: EVIDENCE, description: 'Matching cited claims, strongest first.' },
  },
};
const Q_PARAM = {
  type: 'string',
  description: 'Free text. For a NAME use any transliteration (Sadeq=Ṣádiq, Ghoddus=Quddús). For a DESCRIPTION use a role, event or place ("amanuensis of the Báb", "participated-in Badasht"). Stop-words are ignored and terms are matched independently, so a missing word lowers the rank instead of emptying the result.',
};
// The worked example the connector and docs both point at. It lives in the route DESCRIPTION, not in an
// `examples` keyword: Fastify compiles querystring schemas with ajv, where `examples` must be an array, and
// an OpenAPI-style examples OBJECT there fails the whole route at registration ("data/examples must be array").
const BADASHT_EXAMPLE = [
  '',
  '**Worked example — Letters of the Living ∩ `participated-in` Badasht Conference:**',
  '1. `GET /api/v1/entities/lookup?q=Badasht` → `Badasht Conference` (type `event`, id 1264029).',
  '2. `GET /api/v1/entities/{id}` → `participants[]`, each with `relations` and cited `evidence`.',
  '3. Keep those whose `relations` include `participated-in` (`visited` / `hosted` / `died` answer '
    + '"who was there" too — the relation is yours to filter, nothing is dropped for you).',
  '4. Intersect with the Letters of the Living: `GET /api/v1/entities/lookup?q=Letters of the Living` for the '
    + 'group node, or match the returned people against it.',
  '5. Only now use passage search (`sifter_search`) to QUOTE what you found. It cannot build the list.',
].join('\n');

export default async function peopleRoutes(server) {
  // Phased book-integration roadmap + live grounded counts — powers the biography "progress" popup.
  server.get('/people/progress', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=30, s-maxage=60');
    return getIntegrationProgress();
  });

  server.get('/people', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
    const qs = request.query || {};
    const limit = Math.min(2000, Math.max(1, parseInt(qs.limit, 10) || 50));
    const offset = Math.max(0, parseInt(qs.offset, 10) || 0);
    const data = await listBioPersons();
    let people = data.persons;
    if (qs.side) people = people.filter((p) => p.side === qs.side);
    if (qs.book) { const bs = String(qs.book).split(',').map((s) => s.trim()).filter(Boolean); people = people.filter((p) => bs.some((b) => p.sources.includes(b))); }
    if (qs.portrait === '1' || qs.portrait === 'true') people = people.filter((p) => p.hasPortrait);
    if (qs.min_importance) { const mi = parseInt(qs.min_importance, 10) || 0; people = people.filter((p) => p.importance >= mi); }
    if (qs.q && qs.q.trim()) {
      const qts = toks(qs.q);
      people = people.filter((p) => {
        const hay = [...toks(p.name), ...(p.aliases || []).flatMap(toks), ...(p.kinship || []).flatMap((k) => toks(k.who))];
        return qts.every((qt) => hay.some((h) => h.startsWith(qt) || qt.startsWith(h)));
      });
    }
    if (qs.sort === 'name') people = [...people].sort((a, b) => a.name.localeCompare(b.name));
    const total = people.length;
    const page = people.slice(offset, offset + limit).map((p) => ({
      id: p.id, name: p.name, importance: p.importance, side: p.side, summary: p.summary,
      aliases: p.aliases, kinship: p.kinship, death: p.death, sources: p.sources, hasPortrait: p.hasPortrait, portrait: p.portrait,
    }));
    return { total, limit, offset, withPortraits: data.withPortraits, sides: data.sides, books: data.books, people: page };
  });

  // ── Entity API tool layer (over the evidence-reconciled substrate; api/lib/entity-api.js). Same functions the
  //    general search / Jafar chat call as tools. Merged-duplicate entities are excluded everywhere.
  // GET /api/v1/entities/lookup — FAST, AI-free transliteration-invariant candidate recall (never determinative).
  const lookupRoute = async (request) => ({
    query: String(request.query?.q || ''),
    candidates: await entityLookup(request.query?.q, { type: request.query?.type, limit: request.query?.limit }),
    note: 'RECALL candidates only — bind by evidence, not by this list',
  });
  const lookupSchema = {
    schema: {
      tags: ['Entities'],
      summary: 'Resolve a name to candidate entities (transliteration-invariant)',
      description: 'STEP 1 of "who was at X". Fast, AI-free recall over person/place/work/group/event names in '
        + 'any spelling. Returns candidates to confirm by evidence — never determinative on its own.',
      querystring: {
        type: 'object',
        properties: {
          q: Q_PARAM,
          type: { type: 'string', enum: ['person', 'place', 'work', 'group', 'event'], description: 'Restrict to one node type. The graph has four node kinds plus works: person, group, event, place.' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        required: ['q'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            candidates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string', example: 'Badasht Conference' },
                  type: { type: 'string', example: 'event' },
                  importance: { type: 'number', nullable: true },
                  shared_keys: { type: 'integer', description: 'How many transliteration keys matched.' },
                  canonical_match: { type: 'boolean' },
                },
              },
            },
            note: { type: 'string' },
          },
        },
      },
    },
  };
  server.get('/entities/lookup', lookupSchema, lookupRoute);
  server.get('/people/lookup', lookupSchema, lookupRoute);
  // GET /api/v1/entities/:id — dossier from the new substrate: cited claims (proof+when) + occurrences (+ enrichment).
  server.get('/entities/:id', {
    schema: {
      tags: ['Entities'],
      summary: 'Entity dossier — cited claims for a person; derived participants for an event/place/group',
      description: 'WHERE THE EDGES LIVE: claims hang off the PERSON, not off the event. A person node returns '
        + '`claims` (relation, proof, when, source, paraId). An event, place or group node has no claims of its '
        + 'own — the tie to it sits in the PROSE of a person’s claim ("Quddús — participated-in Badasht '
        + 'conference"), because target_entity_id is almost never set for these: of 92 participated-in claims on '
        + 'Quddús, exactly one carries an object_id. So for event/place/group this endpoint returns '
        + '`participants`, derived by matching the node name against claim prose — the same evidence '
        + 'GET /entities/search returns — and labels that weaker guarantee in `participantsProvenance`. '
        + 'It is recall, not proof: verify each with its proof span and paraId.',
      params: { type: 'object', properties: { id: { type: 'string', description: 'Entity id from entities/lookup.' } }, required: ['id'] },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['person', 'group', 'event', 'place', 'work'], description: 'Node kind.' },
            importance: { type: 'number' },
            summary: { type: 'string', nullable: true },
            aliases: { type: 'array', items: { type: 'string' } },
            claims: { type: 'array', items: EVIDENCE, description: 'Cited claims asserted OF this entity. Populated for people; empty for event/place/group — see participants.' },
            claimCount: { type: 'integer' },
            occurrences: { type: 'array', items: { type: 'object', properties: { book: { type: 'string' }, mentions: { type: 'integer' } } } },
            mentionCount: { type: 'integer' },
            participants: {
              type: 'array',
              description: 'EVENT/PLACE/GROUP ONLY. People whose cited claims mention this node. Filter `relations` by participated-in / visited / hosted / died to answer "who was at X".',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  importance: { type: 'number' },
                  relations: { type: 'array', items: { type: 'string' }, description: 'Distinct relation types tying this person to the node.', example: ['participated-in', 'visited'] },
                  evidence: { type: 'array', items: EVIDENCE },
                },
              },
            },
            participantCount: { type: 'integer' },
            participantsProvenance: {
              type: 'object',
              description: 'States plainly that participants are derived from claim prose, not from a structured edge.',
              properties: {
                derivedFrom: { type: 'string', example: 'claim-prose' },
                note: { type: 'string' },
                equivalentCall: { type: 'string', example: 'GET /api/v1/entities/search?q=Badasht%20Conference' },
              },
            },
            source: { type: 'string' },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const d = await entityDossier(request.params.id);
    if (!d) { reply.code(404); return { error: 'not found or merged' }; }
    return d;
  });
  // ── Entity CATALOG (R1–R7) — the enumeration surface for external consumers.
  //    Identity note that governs all of these: graph_entities.id is AUTOINCREMENT and renumbers on a
  //    full rebuild, so every record carries `key` (the natural key) and /entities/resolve maps keys
  //    back to current ids. See api/lib/entity-catalog.js.

  // R1 — GET /api/v1/entities?type=&religion=&min_importance=&q=&order=&limit=&offset=&after=&fields=
  //      `after` is keyset paging (O(1) per page); use it instead of deep offsets.
  server.get('/entities', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600');
    const q = request.query || {};
    return listEntities({
      type: q.type || null, religion: q.religion ?? null,
      minImportance: q.min_importance ?? null, q: q.q || null,
      order: q.order || 'importance', limit: q.limit, offset: q.offset,
      after: q.after ?? null, fields: q.fields || null,
    });
  });

  // R3 — GET /api/v1/entities/export?type=&fields= — streaming NDJSON, one entity per line.
  //      Streamed from a keyset generator so neither we nor the client holds the graph in memory.
  server.get('/entities/export', async (request, reply) => {
    const q = request.query || {};
    reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    reply.header('Cache-Control', 'no-store');
    const stream = new Readable({ read() {} });
    reply.send(stream);
    (async () => {
      try {
        for await (const e of exportEntities({ type: q.type || null, fields: q.fields || null })) {
          stream.push(JSON.stringify(e) + '\n');
        }
      } catch (err) {
        // The response has already begun, so the only honest signal left is a final error line.
        stream.push(JSON.stringify({ error: 'export failed', detail: String(err?.message || err) }) + '\n');
      } finally { stream.push(null); }
    })();
    return reply;
  });

  // R2 — POST /api/v1/entities/resolve {keys:[...]} → {key: id|null}. The repair path after a renumber.
  server.post('/entities/resolve', async (request, reply) => {
    const keys = (request.body || {}).keys;
    if (!Array.isArray(keys) || !keys.length) { reply.code(400); return { error: 'body must be {keys: [naturalKey, ...]}' }; }
    if (keys.length > 5000) { reply.code(413); return { error: 'max 5000 keys per request' }; }
    return resolveKeys(keys);
  });

  // R2 — GET /api/v1/graph/version — generation fingerprint. Watch `minId`: it only moves on a rebuild.
  server.get('/graph/version', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=120');
    return graphVersion();
  });

  // R5 — GET /api/v1/entities/changes?since=<seq>&limit= — append-only change feed.
  server.get('/entities/changes', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');   // a feed served from cache is a feed that loses events
    const q = request.query || {};
    return changesSince(q.since, { limit: q.limit });
  });

  // Self-describing capability doc, so a consumer does not have to guess what exists.
  server.get('/entities/capabilities', {
    schema: {
      tags: ['Entities'],
      summary: 'What this graph can and cannot answer structurally — read before designing a query',
      description: 'Says plainly which links are real edges and which live only in claim prose, so a client '
        + 'does not infer absence of data from an empty structured result.',
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
          properties: {
            fields: { type: 'array', items: { type: 'string' } },
            orders: { type: 'array', items: { type: 'string' } },
            naturalKey: { type: 'object', additionalProperties: true, description: 'The durable identity; ids renumber on a full rebuild.' },
            idStability: { type: 'object', additionalProperties: true },
            structuredTime: { type: 'object', additionalProperties: true },
            structuredPlace: { type: 'object', additionalProperties: true, description: 'Place is prose-only: zero claims point target_entity_id at a place entity.' },
            structuredEvent: { type: 'object', additionalProperties: true, description: 'Event participation is prose-only too — see GET /entities/{id} participants.' },
            rateLimit: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      fields: ENTITY_FIELDS,
      orders: ['importance', 'mentions', 'name', 'id'],
      naturalKey: {
        format: 'entity_type|canonical_name|religion  (each component percent-encoded)',
        example: naturalKey({ entity_type: 'person', canonical_name: "Mullá Ḥusayn", religion: '' }),
        note: 'the durable identity — ids renumber on a full rebuild, keys do not',
      },
      idStability: { stable: false, detectRenumber: 'GET /graph/version → minId', repair: 'POST /entities/resolve' },
      structuredTime: {
        available: true, fields: ['value', 'precision', 'basis', 'anchor'],
        coverage: 'about 26% of claims carry value+precision; 99% carry basis',
      },
      structuredPlace: {
        available: false,
        note: 'no structured place data exists. entity_claims has no place columns, and zero claims point target_entity_id at a place entity, though 3,518 place entities exist. Place appears only inside claim prose.',
      },
      // Match the honesty already given for place. Measured 2026-08-28 on Quddús (1,508 claims): 392 carry
      // an object_id, but of 92 `participated-in` claims exactly ONE does — person→person edges are real,
      // person→event edges are not. An agent that assumed otherwise read an empty event dossier as "the
      // corpus does not cover this event" and fell back to passage search.
      structuredEvent: {
        available: false,
        note: 'event participation is not a structured edge: claims name the event inside their statement text '
          + 'rather than pointing target_entity_id at it. GET /entities/{id} on an event therefore returns '
          + '`participants` derived from claim prose (labelled in participantsProvenance), and '
          + 'GET /entities/search?q=<event> returns the same evidence. Filter by relation: participated-in, '
          + 'visited, hosted, died.',
        howToList: 'GET /api/v1/entities/lookup?q=Badasht → id → GET /api/v1/entities/{id} → participants[]',
      },
      rateLimit: { perKeyPerHour: 1000, globalPerMinute: 100, note: 'ask for a raised per-key limit for bulk work' },
    };
  });

  // GET /api/v1/entities/search?q=… — candidate people whose CITED claims match; returns each with evidence.
  server.get('/entities/search', {
    schema: {
      tags: ['Entities'],
      summary: 'Find PEOPLE whose cited claims match a description, role, event or place',
      description: 'STEP 2 of "who was at X". Answers descriptive/relational person questions a name lookup '
        + 'cannot: "amanuensis of the Báb", "participated-in Badasht", "died at Fort Ṭabarsí". Each result '
        + 'carries the cited claims as evidence — filter them by `relation` to build the list, then use '
        + 'passage search to quote. Terms are matched independently and ranked (exact phrase first), so a '
        + 'word the corpus words differently lowers the rank rather than emptying the result.'
        + BADASHT_EXAMPLE,
      querystring: {
        type: 'object',
        properties: { q: Q_PARAM, limit: { type: 'integer', minimum: 1, maximum: 30, default: 12 } },
        required: ['q'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            results: { type: 'array', items: PERSON_HIT },
            note: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => await entitySearch(request.query?.q, { limit: request.query?.limit }));

  // GET /api/v1/people/search?q=… — intelligent meaning-search; returns matching ids + per-person evidence + answer.
  // Edge-cached per query string: identical questions serve instantly for 10 min.
  server.get('/people/search', {
    schema: {
      tags: ['Entities'],
      summary: 'Meaning-search over people — returns matching ids, per-person evidence and a synthesised answer',
      description: 'Use alongside entities/lookup for "who was at X" questions. Returns people with evidence '
        + 'rather than passages; passage search is for citation, not for building the list.',
      querystring: { type: 'object', properties: { q: Q_PARAM }, required: ['q'] },
      response: {
        200: {
          type: 'object',
          additionalProperties: true,
          properties: {
            answer: { type: 'string', nullable: true, description: 'Synthesised answer, when one can be grounded.' },
            people: { type: 'array', items: PERSON_HIT, description: 'Matching people with their evidence.' },
          },
        },
      },
    },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
    return await bioSearch(request.query?.q);
  });

  server.get('/people/:id', async (request, reply) => {
    const person = await getBioPerson(request.params.id);
    if (!person) { reply.code(404); return { error: 'not found' }; }
    return person;
  });
}
