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
  server.get('/entities/lookup', lookupRoute);
  server.get('/people/lookup', lookupRoute);
  // GET /api/v1/entities/:id — dossier from the new substrate: cited claims (proof+when) + occurrences (+ enrichment).
  server.get('/entities/:id', async (request, reply) => {
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
  server.get('/entities/capabilities', async (request, reply) => {
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
      rateLimit: { perKeyPerHour: 1000, globalPerMinute: 100, note: 'ask for a raised per-key limit for bulk work' },
    };
  });

  // GET /api/v1/entities/search?q=… — candidate people whose CITED claims match; returns each with evidence.
  server.get('/entities/search', async (request) => await entitySearch(request.query?.q, { limit: request.query?.limit }));

  // GET /api/v1/people/search?q=… — intelligent meaning-search; returns matching ids + per-person evidence + answer.
  // Edge-cached per query string: identical questions serve instantly for 10 min.
  server.get('/people/search', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
    return await bioSearch(request.query?.q);
  });

  server.get('/people/:id', async (request, reply) => {
    const person = await getBioPerson(request.params.id);
    if (!person) { reply.code(404); return { error: 'not found' }; }
    return person;
  });
}
