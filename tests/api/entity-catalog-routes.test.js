// Entity catalog ROUTES (R1–R7) — the wiring an external consumer actually calls.
//
// The module unit tests (entity-catalog.test.js) prove the logic; these prove the endpoints exist, are
// reachable without an admin key, return the documented shape, and enforce their limits. A module that
// works behind a route that was never registered is a feature nobody can use.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Entity catalog routes', () => {
  let server;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.MEILISEARCH_HOST = 'http://localhost:7700';
    process.env.MEILISEARCH_KEY = 'test-key';
    process.env.RATE_LIMIT_ENABLED = 'false';
    const { createServer } = await import('../../api/server.js');
    server = await createServer({ logger: false });
    await server.ready();
  }, 30000);

  afterAll(async () => { if (server) await server.close(); });

  const get = (url) => server.inject({ method: 'GET', url });
  const post = (url, payload) => server.inject({ method: 'POST', url, payload });

  // ── R1
  it('GET /api/v1/entities is registered and public (no admin key)', async () => {
    const r = await get('/api/v1/entities?limit=5');
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b).toHaveProperty('entities');
    expect(Array.isArray(b.entities)).toBe(true);
  });

  it('every enumerated record carries the natural key — the durable identity', async () => {
    const b = (await get('/api/v1/entities?limit=3')).json();
    for (const e of b.entities) {
      expect(e).toHaveProperty('key');
      expect(String(e.key).split('|')).toHaveLength(3);
    }
  });

  it('caps limit so one request cannot pull the whole graph', async () => {
    expect((await get('/api/v1/entities?limit=999999')).json().limit).toBeLessThanOrEqual(1000);
  });

  it('accepts a type filter without erroring (entity_type, not type)', async () => {
    expect((await get('/api/v1/entities?type=person&limit=2')).statusCode).toBe(200);
  });

  it('exposes a keyset cursor for deep paging and drops the meaningless total', async () => {
    const b = (await get('/api/v1/entities?after=0&limit=2')).json();
    expect(b.total).toBeNull();
    expect(b.offset).toBeNull();
  });

  // ── R4
  it('honours fields= and always keeps id + key resolvable', async () => {
    const b = (await get('/api/v1/entities?limit=1&fields=name')).json();
    if (b.entities.length) {
      expect(Object.keys(b.entities[0]).sort()).toEqual(['id', 'key', 'name']);
    }
  });

  it('ignores an unknown field rather than 500ing', async () => {
    expect((await get('/api/v1/entities?limit=1&fields=name,notAField')).statusCode).toBe(200);
  });

  // ── R2
  it('GET /api/v1/graph/version never promises stable ids and exposes minId', async () => {
    const r = await get('/api/v1/graph/version');
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.idsAreStable).toBe(false);
    expect(b).toHaveProperty('minId');
    expect(b).toHaveProperty('generation');
  });

  it('POST /api/v1/entities/resolve rejects a missing body with 400, not a crash', async () => {
    expect((await post('/api/v1/entities/resolve', {})).statusCode).toBe(400);
  });

  it('POST /api/v1/entities/resolve refuses an oversized batch with 413', async () => {
    const keys = Array.from({ length: 5001 }, (_, i) => `person|N${i}|`);
    expect((await post('/api/v1/entities/resolve', { keys })).statusCode).toBe(413);
  });

  it('resolve returns an explicit null for an unknown key instead of dropping it', async () => {
    const b = (await post('/api/v1/entities/resolve', { keys: ['person|NoSuchPersonXYZ|'] })).json();
    expect(b.resolved).toHaveProperty('person|NoSuchPersonXYZ|', null);
    expect(b.missing).toBe(1);
  });

  // ── R5
  it('GET /api/v1/entities/changes returns a pollable cursor', async () => {
    const r = await get('/api/v1/entities/changes?since=0&limit=5');
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b).toHaveProperty('latestSeq');
    expect(b).toHaveProperty('changes');
  });

  it('the change feed is never served from cache — a cached feed loses events', async () => {
    expect((await get('/api/v1/entities/changes?since=0')).headers['cache-control']).toContain('no-store');
  });

  // ── R3
  it('GET /api/v1/entities/export streams NDJSON, not a JSON array', async () => {
    const r = await get('/api/v1/entities/export?limit=2');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/x-ndjson');
    if (r.payload.trim()) {
      for (const line of r.payload.trim().split('\n').slice(0, 3)) {
        expect(() => JSON.parse(line)).not.toThrow();   // every line independently parseable
      }
    }
  }, 30000);

  // ── R6 / R7 — the capability doc is the contract we hand the client.
  it('capabilities states plainly that ids are NOT stable and how to repair', async () => {
    const b = (await get('/api/v1/entities/capabilities')).json();
    expect(b.idStability.stable).toBe(false);
    expect(b.idStability.repair).toContain('/entities/resolve');
  });

  it('capabilities documents structured time as available with its real coverage', async () => {
    const b = (await get('/api/v1/entities/capabilities')).json();
    expect(b.structuredTime.available).toBe(true);
    expect(b.structuredTime.fields).toEqual(expect.arrayContaining(['value', 'precision', 'basis']));
  });

  it('capabilities says structured place does NOT exist — an honest no beats a vague maybe', async () => {
    const b = (await get('/api/v1/entities/capabilities')).json();
    expect(b.structuredPlace.available).toBe(false);
    expect(b.structuredPlace.note).toMatch(/no structured place/i);
  });

  it('capabilities advertises exactly the fields the enumeration can project', async () => {
    const b = (await get('/api/v1/entities/capabilities')).json();
    expect(b.fields).toEqual(expect.arrayContaining(['id', 'key', 'name', 'type', 'importance']));
  });

  // ── Route-shadowing guard: the static paths must not be swallowed by /entities/:id.
  it('static catalog paths are not captured by the /entities/:id param route', async () => {
    for (const p of ['/api/v1/entities/capabilities', '/api/v1/entities/changes']) {
      const r = await get(p);
      expect(r.statusCode).toBe(200);
      expect(r.json()).not.toHaveProperty('error', 'not found or merged');
    }
  });
});
