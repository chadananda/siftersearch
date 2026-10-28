// SSRF guard suite (Chad 10-28): private / loopback / link-local / CGNAT / metadata addresses, odd IP spellings, DNS rebinding, redirects
// re-checked per hop, ports, schemes, robots.txt, per-host politeness, the capped tower-side GET.
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { isBlockedIp, parseTarget, guardedLookup, guardedRequest, robotsRules, robotsAllows, robotsAllowed, boundedGet, politeWait, GuardError, isMediaPage } from '../../api/lib/dewey/net-guard.js';

describe('isBlockedIp', () => {
  it.each(['127.0.0.1', '127.9.9.9', '10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '192.0.0.8', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:7f00:1', '64:ff9b::7f00:1', 'ff02::1', '2001:db8::1'])('blocks %s', (ip) => expect(isBlockedIp(ip)).toBe(true));
  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '100.63.255.255', '2606:4700:4700::1111', '151.101.1.69'])('allows %s', (ip) => expect(isBlockedIp(ip)).toBe(false));
  it('a non-IP string is blocked, not allowed', () => expect(isBlockedIp('not-an-ip')).toBe(true));
});

describe('parseTarget', () => {
  it.each([['file:///etc/passwd', /http and https/], ['ftp://x.org/a', /http and https/], ['gopher://x.org', /http and https/], ['javascript:alert(1)', /http and https/], ['https://user:pw@x.org/', /login/],
    ['http://x.org:8080/', /port 8080/], ['https://x.org:22/', /port 22/], ['http://localhost/', /internal/], ['http://foo.localhost/', /internal/], ['http://printer.local/', /internal/],
    ['http://metadata.google.internal/', /internal/], ['http://tower-nas.tail1234.ts.net/', /internal/], ['http://127.0.0.1/', /private/], ['http://[::1]/', /private/], ['http://169.254.169.254/latest/meta-data/', /private/],
    ['http://2130706433/', /private/], ['http://0x7f.1/', /private/], ['http://0177.0.0.1/', /private/], ['http://127.1/', /private/], ['http://100.64.1.1/', /private/], ['http://[::ffff:127.0.0.1]/', /private/], ['not a url', /web address/],
  ])('refuses %s', (u, why) => expect(() => parseTarget(u)).toThrow(why));
  it('accepts an ordinary address', () => expect(parseTarget('https://example.org/book.pdf?a=1').hostname).toBe('example.org'));
});

describe('DNS: resolved addresses are checked at connect time', () => {
  const look = (resolve) => (host) => new Promise((res, rej) => guardedLookup(resolve)(host, { all: true }, (e, a) => (e ? rej(e) : res(a))));
  it('a public name resolving to a private address is refused (rebinding)', async () => {
    await expect(look(async () => [{ address: '10.0.0.5', family: 4 }])('evil.example')).rejects.toThrow(/private or reserved/);
  });
  it('ANY private answer among several refuses the lot', async () => {
    await expect(look(async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }])('mixed.example')).rejects.toThrow(/private or reserved/);
  });
  it('a clean answer passes; a lookup failure is a DNS error', async () => {
    expect(await look(async () => [{ address: '93.184.216.34', family: 4 }])('ok.example')).toEqual([{ address: '93.184.216.34', family: 4 }]);
    await expect(look(async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); })('nx.example')).rejects.toMatchObject({ code: 'DNS' });
  });
  it('the SAME lookup is the connect lookup: it is what rawRequest hands to http.request', async () => {
    let seen;
    const transport = { request: (u, opts, cb) => { seen = opts; const req = new PassThrough(); req.end = () => { const res = new PassThrough(); res.statusCode = 200; res.headers = {}; cb(res); }; return req; } };
    await guardedRequest('https://example.org/x', { transport, polite: false, lookup: () => {} });
    expect(typeof seen.lookup).toBe('function'); expect(seen.agent).toBe(false);
  });
});

describe('redirects are re-checked on every hop', () => {
  const chain = (hops) => ({ request: (u, opts, cb) => {
    const req = new PassThrough(); const url = String(u);
    req.end = () => { const res = new PassThrough(); const next = hops[url]; res.statusCode = next ? 302 : 200; res.headers = next ? { location: next } : { 'content-type': 'application/pdf' }; cb(res); };
    return req;
  } });
  it('redirect to a private IP is refused', async () => {
    await expect(guardedRequest('https://a.example/x', { transport: chain({ 'https://a.example/x': 'http://169.254.169.254/latest/' }), polite: false })).rejects.toThrow(/private/);
  });
  it('redirect to localhost / a non-http scheme / a bad port is refused', async () => {
    for (const to of ['http://localhost/admin', 'file:///etc/passwd', 'https://b.example:9200/']) {
      await expect(guardedRequest('https://a.example/x', { transport: chain({ 'https://a.example/x': to }), polite: false })).rejects.toThrow(GuardError);
    }
  });
  it('a relative redirect resolves and follows; a loop stops', async () => {
    const ok = await guardedRequest('https://a.example/x', { transport: chain({ 'https://a.example/x': '/y' }), polite: false });
    expect(ok.url).toBe('https://a.example/y'); expect(ok.hops).toBe(1);
    await expect(guardedRequest('https://a.example/x', { transport: chain({ 'https://a.example/x': '/x' }), polite: false, maxRedirects: 3 })).rejects.toMatchObject({ code: 'REDIRECTS' });
  });
});

describe('robots.txt', () => {
  const R = `User-agent: *\nDisallow: /private/\nAllow: /private/open/\nDisallow: /*.pdf$\nUser-agent: DeweyLibrarian\nDisallow: /nodewey/\n`;
  it('prefers our own group; longest rule wins; allow beats disallow on a tie', () => {
    const mine = robotsRules(R); expect(robotsAllows(mine, '/nodewey/a')).toBe(false); expect(robotsAllows(mine, '/private/a')).toBe(true);
    const star = robotsRules(R, 'OtherBot'); expect(robotsAllows(star, '/private/a')).toBe(false); expect(robotsAllows(star, '/private/open/a')).toBe(true); expect(robotsAllows(star, '/x/book.pdf')).toBe(false); expect(robotsAllows(star, '/x/book.pdf?v=1')).toBe(true);
  });
  it('missing robots allows; an unreachable one refuses; a disallow refuses with a reason', async () => {
    expect((await robotsAllowed('https://x.org/a', { fetchText: async () => '' })).allowed).toBe(true);
    expect((await robotsAllowed('https://x.org/a', { fetchText: async () => { throw new Error('503'); } })).allowed).toBe(false);
    const d = await robotsAllowed('https://x.org/nodewey/a', { fetchText: async () => R }); expect(d.allowed).toBe(false); expect(d.why).toMatch(/robots\.txt/);
  });
});

describe('politeness + media + capped GET', () => {
  it('waits to keep 1 request per second per host', async () => {
    let t = 1_000_000; const slept = [];
    const o = { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } };
    await politeWait('p.example', o); await politeWait('p.example', o); await politeWait('q.example', o);
    expect(slept).toEqual([1000]);
  });
  it('video pages belong to the media path', () => { expect(isMediaPage('https://www.youtube.com/watch?v=1')).toBe(true); expect(isMediaPage('https://example.org/a.pdf')).toBe(false); });
  const body = (n, headers = {}) => ({ request: async () => { const res = new PassThrough(); res.statusCode = 200; res.headers = { 'content-type': 'application/pdf', ...headers }; setImmediate(() => { res.write(Buffer.alloc(n, 1)); res.end(); }); return { res, url: 'https://x.org/a.pdf' }; } });
  it('boundedGet refuses a declared-too-large file and one that grows past the cap', async () => {
    await expect(boundedGet('https://x.org/a.pdf', { ...body(10, { 'content-length': String(50 * 1024 ** 2) }), maxBytes: 1024 })).rejects.toMatchObject({ code: 'TOO_BIG' });
    await expect(boundedGet('https://x.org/a.pdf', { ...body(5000), maxBytes: 1024 })).rejects.toMatchObject({ code: 'TOO_BIG' });
    expect((await boundedGet('https://x.org/a.pdf', { ...body(100), maxBytes: 1024 })).buf.length).toBe(100);
  });
  it('boundedGet will not read an HTML page robots.txt forbids', async () => {
    await expect(boundedGet('https://x.org/p', { ...body(10, { 'content-type': 'text/html' }), robots: async () => ({ allowed: false, why: 'no' }) })).rejects.toMatchObject({ code: 'ROBOTS' });
  });
});
