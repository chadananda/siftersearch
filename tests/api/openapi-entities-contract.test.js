/**
 * OPENAPI CONTRACT for the people/entity graph routes.
 *
 * WHY THIS EXISTS (2026-08-28): api/routes/people.js handlers carried no Fastify schema, so the served
 * OpenAPI listed ZERO parameters and a bare "Default Response" for every one of them. An agent reading the
 * spec could not learn that `q` exists, that evidence carries `relation`/`statement`/`source`/`paraId`, or
 * how to answer "who was at X" — so it guessed, and guessed passage search. A contract that is invisible is
 * not a contract.
 *
 * These assertions run against the SERVED document, not the source, because that is what a client reads.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('OpenAPI contract — people/entity graph', () => {
  let server, spec;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.CORS_ORIGINS = 'https://siftersearch.com';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();
    const res = await server.inject({ method: 'GET', url: '/api/v1/docs/json' });
    spec = JSON.parse(res.payload);
  }, 30000);

  afterAll(async () => { if (server) await server.close(); });

  const op = (path, verb = 'get') => spec.paths?.[path]?.[verb];
  const paramNames = (path, verb = 'get') => (op(path, verb)?.parameters || []).map((p) => p.name);
  const schemaOf = (path, verb = 'get') =>
    op(path, verb)?.responses?.['200']?.content?.['application/json']?.schema;
  const asText = (o) => JSON.stringify(o || {});

  describe('query parameters are documented', () => {
    it.each([
      ['/api/v1/entities/search'],
      ['/api/v1/entities/lookup'],
      ['/api/v1/people/search'],
    ])('%s documents its q parameter', (path) => {
      expect(paramNames(path)).toContain('q');
    });

    it('q carries a description, not just a name', () => {
      const q = (op('/api/v1/entities/search').parameters || []).find((p) => p.name === 'q');
      expect(q?.description?.length || 0).toBeGreaterThan(20);
    });
  });

  describe('the evidence shape is documented — this is what makes the graph usable', () => {
    it('entities/search 200 has a real schema, not a Default Response', () => {
      expect(schemaOf('/api/v1/entities/search')).toBeDefined();
    });

    it.each(['relation', 'statement', 'source', 'paraId'])(
      'evidence documents %s', (field) => {
        const ev = schemaOf('/api/v1/entities/search')
          ?.properties?.results?.items?.properties?.evidence?.items?.properties;
        expect(Object.keys(ev || {})).toContain(field);
      });
  });

  describe('the worked example is present, so an agent can copy it', () => {
    it('shows Letters of the Living ∩ participated-in Badasht Conference', () => {
      const text = asText(spec.paths['/api/v1/entities/search']);
      expect(text).toMatch(/Letters of the Living/i);
      expect(text).toMatch(/Badasht/i);
      expect(text).toMatch(/participated-in/);
    });
  });

  describe('the event node tells the truth about itself', () => {
    // GET /entities/{id} on Badasht Conference returns claims:[] because event participation is not a
    // structured edge — 92 participated-in claims on Quddús, ONE with object_id. The spec must say so
    // rather than presenting an empty dossier as if the event were unused.
    it('documents where participants come from for event/place nodes', () => {
      const text = asText(spec.paths['/api/v1/entities/{id}']);
      expect(text).toMatch(/participants/i);
      expect(text).toMatch(/entities\/search|claim prose|prose/i);
    });
  });

  // Item 4 of the tester's list: /people/{id} was still an empty spec after the first pass, because the
  // schema sweep covered the entity routes and stopped there.
  describe('people/{id} is documented too', () => {
    it('documents its id path parameter', () => {
      expect(paramNames('/api/v1/people/{id}')).toContain('id');
    });
    it('documents a 200 response schema', () => {
      expect(schemaOf('/api/v1/people/{id}')).toBeDefined();
    });
    it('points at entities/{id} for cited claims, so the two person routes are not confused', () => {
      expect(op('/api/v1/people/{id}')?.description || '').toMatch(/entities\/\{id\}/);
    });
  });

  // Item 3: the live body was {ids, q, group, reasoning} while the spec promised people[] with evidence.
  // The spec half of that contract is asserted here; the behavioural half is in entity-graph-contract.
  describe('people/search promises people[] with verifiable evidence', () => {
    it('documents people[] and its evidence fields', () => {
      const props = schemaOf('/api/v1/people/search')?.properties?.people?.items?.properties;
      expect(props).toBeDefined();
      expect(Object.keys(props)).toContain('evidence');
      const ev = props.evidence.items.properties;
      for (const f of ['relation', 'statement', 'source', 'paraId']) expect(Object.keys(ev)).toContain(f);
    });
  });

  // ids must be documented as a PROJECTION, so nobody reimplements it as a second list.
  describe('people/search documents ids as a projection of people[]', () => {
    it('documents ids and reasoning', () => {
      const props = schemaOf('/api/v1/people/search')?.properties || {};
      expect(Object.keys(props)).toContain('ids');
      expect(Object.keys(props)).toContain('reasoning');
    });
    it('says outright that ids is not a second list', () => {
      const d = schemaOf('/api/v1/people/search')?.properties?.ids?.description || '';
      expect(d).toMatch(/projection|never a second list/i);
    });
  });

  describe('no schema-free routes left in this family', () => {
    it.each([
      '/api/v1/entities/search',
      '/api/v1/entities/lookup',
      '/api/v1/people/search',
      '/api/v1/entities/{id}',
      '/api/v1/entities/capabilities',
      '/api/v1/people/{id}',
    ])('%s documents a 200 response schema', (path) => {
      expect(schemaOf(path)).toBeDefined();
    });
  });
});
