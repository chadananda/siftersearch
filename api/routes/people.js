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
import { listBioPersons, getBioPerson, bioSearch } from '../lib/bio.js';
import { queryAll } from '../lib/db.js';
import { entityLookup, entityDossier, entitySearch } from '../lib/entity-api.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['‘’`ʻ]/g, '').toLowerCase();
const toks = (s) => fold(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1);

export default async function peopleRoutes(server) {
  server.get('/people', async (request) => {
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
  // GET /api/v1/entities/search?q=… — candidate people whose CITED claims match; returns each with evidence.
  server.get('/entities/search', async (request) => await entitySearch(request.query?.q, { limit: request.query?.limit }));

  // GET /api/v1/people/search?q=… — intelligent meaning-search; returns matching ids + per-person evidence + answer
  server.get('/people/search', async (request) => await bioSearch(request.query?.q));

  server.get('/people/:id', async (request, reply) => {
    const person = await getBioPerson(request.params.id);
    if (!person) { reply.code(404); return { error: 'not found' }; }
    return person;
  });
}
