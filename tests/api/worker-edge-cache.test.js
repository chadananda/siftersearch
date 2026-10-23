// Edge SWR cache policy (worker/edge-cache.js): what is cached, what bypasses, the key, and what may be stored.
import { describe, it, expect } from 'vitest';
import { policyFor, cacheKey, storable, isCompleteHtml, freshness, sMaxAge } from '../../worker/edge-cache.js';

const U = (p) => new URL('https://siftersearch.com' + p);
const H = (o = {}) => new Headers(o);
const pol = (p, method = 'GET', h = {}) => policyFor(U(p), method, H(h));

describe('policyFor', () => {
  it('caches public SSR pages as html', () => {
    for (const p of ['/', '/media', '/media/some-talk', '/media/some-talk/clip/1-2', '/media/x/m/abc', '/library', '/library/bahai/x', '/biography/12', '/docs', '/docs/api', '/about']) {
      expect(pol(p)).toMatchObject({ mode: 'cache', kind: 'html', l2: true });
    }
  });
  it('caches listed public API reads with per-route fresh TTLs', () => {
    expect(pol('/api/media/index')).toMatchObject({ mode: 'cache', kind: 'api', fresh: 60 });
    expect(pol('/api/media/progress')).toMatchObject({ mode: 'cache', fresh: 15 });
    expect(pol('/api/media/progress/live')).toMatchObject({ mode: 'cache', fresh: 10 });
    expect(pol('/api/media/a-talk')).toMatchObject({ mode: 'cache', fresh: 120 });
    expect(pol('/api/library/tree')).toMatchObject({ mode: 'cache' });
    expect(pol('/api/v1/people/123')).toMatchObject({ mode: 'cache' });
  });
  it('bypasses non-GET, credentials, auth/chat/admin routes and unlisted paths', () => {
    expect(pol('/media', 'POST').mode).toBe('bypass');
    expect(pol('/media', 'HEAD').mode).toBe('bypass');
    expect(pol('/api/media/index', 'GET', { authorization: 'Bearer x' }).mode).toBe('bypass');
    expect(pol('/media', 'GET', { 'x-internal-key': 'k' }).mode).toBe('bypass');
    expect(pol('/api/media/index', 'GET', { 'x-api-key': 'k' }).mode).toBe('bypass');
    for (const p of ['/api/auth/session', '/api/chat/stream', '/api/v1/chat', '/api/admin/ops/services', '/api/media/admin/progress', '/api/media/admin',
      '/api/library/stats', '/api/library/recent', '/api/library/documents/1/content', '/api/documents/5', '/api/search']) {
      expect(pol(p).mode, p).toBe('bypass');
    }
    for (const p of ['/admin', '/admin/media', '/profile', '/settings', '/referrals', '/print/x', '/community/new', '/_s1/run', '/_edge/warm', '/widget.js', '/health']) {
      expect(pol(p).mode, p).toBe('bypass');
    }
    expect(pol('/media?nocache=1').mode).toBe('bypass');
  });
  it('does not consult cookies (cached routes are public; origin fetches never carry them)', () => {
    expect(pol('/media', 'GET', { cookie: 'refresh_token=abc; sifter_sid=sess_1' }).mode).toBe('cache');
  });
});

describe('cacheKey', () => {
  it('namespaces HTML by build version, API by a fixed namespace', () => {
    expect(cacheKey(U('/media'), 'html', '2.1.0')).toBe('/__edge/h-2.1.0/media');
    expect(cacheKey(U('/media'), 'html', '2.1.1')).not.toBe(cacheKey(U('/media'), 'html', '2.1.0'));
    expect(cacheKey(U('/api/media/index'), 'api', '2.1.0')).toBe(cacheKey(U('/api/media/index'), 'api', '9.9.9'));
  });
  it('sorts the query, drops tracking params and a trailing slash', () => {
    expect(cacheKey(U('/media/?speaker=b&q=a&utm_source=x&fbclid=y'), 'html', 'v')).toBe('/__edge/h-v/media?q=a&speaker=b');
    expect(cacheKey(U('/'), 'html', 'v')).toBe('/__edge/h-v/');
  });
});

describe('storable', () => {
  const html = '<!DOCTYPE html><html><body>ok</body></html>\n';
  const hh = (o = {}) => H({ 'content-type': 'text/html; charset=utf-8', ...o });
  it('stores complete 200 HTML', () => {
    expect(storable({ status: 200, headers: hh(), text: html, kind: 'html' }).ok).toBe(true);
  });
  it('never stores truncated, tainted, non-200, Set-Cookie or private HTML', () => {
    expect(storable({ status: 200, headers: hh(), text: '<html><body>cut', kind: 'html' }).why).toBe('truncated');
    expect(storable({ status: 200, headers: hh(), text: html, kind: 'html', tainted: true }).why).toBe('tainted render');
    expect(storable({ status: 500, headers: hh(), text: html, kind: 'html' }).ok).toBe(false);
    expect(storable({ status: 200, headers: hh({ 'set-cookie': 'a=b' }), text: html, kind: 'html' }).why).toBe('set-cookie');
    expect(storable({ status: 200, headers: hh({ 'cache-control': 'private, max-age=0' }), text: html, kind: 'html' }).why).toBe('cache-control');
    expect(storable({ status: 200, headers: hh({ 'cache-control': 'no-store' }), text: html, kind: 'html' }).why).toBe('cache-control');
  });
  it('API: valid JSON only; the anonymous sifter_sid mint is stripped, any other cookie refuses', () => {
    const jh = (o = {}) => H({ 'content-type': 'application/json; charset=utf-8', ...o });
    expect(storable({ status: 200, headers: jh(), text: '{"a":1}', kind: 'api' }).ok).toBe(true);
    expect(storable({ status: 200, headers: jh(), text: '{"a":', kind: 'api' }).why).toBe('truncated json');
    expect(storable({ status: 200, headers: jh({ 'set-cookie': 'sifter_sid=sess_1; Path=/' }), text: '{}', kind: 'api' })).toMatchObject({ ok: true, stripCookie: true });
    expect(storable({ status: 200, headers: jh({ 'set-cookie': 'refresh_token=x' }), text: '{}', kind: 'api' }).ok).toBe(false);
    expect(storable({ status: 404, headers: jh(), text: '{}', kind: 'api' }).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('isCompleteHtml', () => {
    expect(isCompleteHtml('<html></html>')).toBe(true);
    expect(isCompleteHtml('<html></HTML>\n  ')).toBe(true);
    expect(isCompleteHtml('<html><body>')).toBe(false);
    expect(isCompleteHtml('')).toBe(false);
  });
  it('freshness: HIT inside the fresh window, STALE after', () => {
    expect(freshness(1000, 60, 1000 + 59_000)).toBe('HIT');
    expect(freshness(1000, 60, 1000 + 61_000)).toBe('STALE');
  });
  it('sMaxAge', () => {
    expect(sMaxAge('public, s-maxage=300, stale-while-revalidate=86400')).toBe(300);
    expect(sMaxAge('public, max-age=60')).toBe(null);
  });
});
