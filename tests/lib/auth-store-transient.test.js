// src/lib/auth.svelte.js initAuth: a 530 / network error / 5xx while checking the session must not
// show the guest state (10-22 storm). Signs out only on an authoritative 401/403 from our API.
// The store uses runes, so it is compiled with svelte's compileModule into tmp/ (gitignored) first.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileModule } from 'svelte/compiler';

const ROOT = resolve(__dirname, '../..');
const OUT_DIR = resolve(ROOT, 'tmp/test-compiled');
const OUT = resolve(OUT_DIR, 'auth-store.compiled.js');

mkdirSync(OUT_DIR, { recursive: true });
const src = readFileSync(resolve(ROOT, 'src/lib/auth.svelte.js'), 'utf8');
const { js } = compileModule(src, { filename: 'auth.svelte.js', generate: 'client' });
writeFileSync(OUT, js.code.replace("'./api.js'", JSON.stringify(resolve(ROOT, 'src/lib/api.js'))));

let store, fetchMock, storage;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), body: { cancel: vi.fn(async () => {}) }, json: async () => body });
const CHAD = { id: 1, email: 'someone@example.com', name: 'Someone', tier: 'admin' };

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
  });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), location: {} });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  store = await import(OUT);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function route(handlers) {
  fetchMock.mockImplementation(async (url) => {
    for (const [frag, h] of handlers) if (String(url).includes(frag)) return h();
    throw new Error('unrouted ' + url);
  });
}

async function signedIn() {
  route([['/api/auth/refresh', () => json(200, { accessToken: 't1' })], ['/api/auth/me', () => json(200, { user: CHAD })]]);
  await store.initAuth();
  expect(store.getAuthState().user?.email).toBe(CHAD.email);
}

describe('initAuth under transient failures', () => {
  it('a 530 on refresh keeps the last known user (fresh page load)', async () => {
    await signedIn();
    // New page load: module state gone, only localStorage survives.
    vi.resetModules();
    store = await import(OUT);
    route([['/api/auth/refresh', () => json(530, {})]]);
    await store.initAuth();
    expect(store.getAuthState().isAuthenticated).toBe(true);
    expect(store.getAuthState().user.email).toBe(CHAD.email);
  });

  it('a network error on refresh keeps the user and retries with backoff until it recovers', async () => {
    await signedIn();
    route([['/api/auth/refresh', () => { throw new TypeError('Failed to fetch'); }]]);
    await store.initAuth();
    expect(store.getAuthState().isAuthenticated).toBe(true);
    const calls = fetchMock.mock.calls.length;

    route([['/api/auth/refresh', () => json(200, { accessToken: 't2' })], ['/api/auth/me', () => json(200, { user: { ...CHAD, name: 'Renamed' } })]]);
    await vi.advanceTimersByTimeAsync(2500);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    expect(store.getAuthState().user.name).toBe('Renamed');
  });

  it('a 502 from /me after a good refresh does not sign out', async () => {
    await signedIn();
    route([['/api/auth/refresh', () => json(200, { accessToken: 't3' })], ['/api/auth/me', () => json(502, {})]]);
    const p = store.initAuth();
    await vi.advanceTimersByTimeAsync(20000); // request() retries GETs with backoff
    await p;
    expect(store.getAuthState().isAuthenticated).toBe(true);
  });

  it('an authoritative 401 on refresh signs out and forgets the cached user', async () => {
    await signedIn();
    route([['/api/auth/refresh', () => json(401, { message: 'Invalid or expired refresh token' })]]);
    await store.initAuth();
    expect(store.getAuthState().isAuthenticated).toBe(false);
    expect(storage.get('sifter_last_user')).toBeUndefined();
  });

  it('an anonymous visitor (no cookie → 401) stays a guest', async () => {
    route([['/api/auth/refresh', () => json(401, {})]]);
    await store.initAuth();
    expect(store.getAuthState().isAuthenticated).toBe(false);
  });
});
