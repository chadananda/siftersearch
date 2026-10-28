// SSRF guard for everything Dewey fetches (Chad 10-28): http(s) only, ports 80/443, no private / loopback / link-local / CGNAT (Tailscale) /
// metadata addresses, DNS RESOLVED and checked at connect time (the checked lookup IS the connect lookup, so a DNS-rebind between "check" and
// "connect" cannot happen), every redirect hop re-checked, robots.txt aware, 1 request/second per host, honest User-Agent.
// Pure-ish: `lookup` and `transport` are injectable. Used by the worker (scripts/dewey/worker) and by tower only to refuse bad URLs early.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

export const UA = 'DeweyLibrarian/1.0 (+https://siftersearch.com/dewey; librarian bot for the Ocean Library)';
export class GuardError extends Error { constructor(msg, code = 'BLOCKED') { super(msg); this.code = code; } }

const v4 = (ip) => ip.split('.').map(Number);
const inV4 = (n, base, bits) => { const m = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return (n & m) >>> 0 === (base & m) >>> 0; };
const num4 = (ip) => v4(ip).reduce((a, b) => ((a << 8) | b) >>> 0, 0);
const BLOCK4 = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]].map(([b, n]) => [num4(b), n]);

/** Is this literal IP unusable for an outbound fetch? Handles IPv4, IPv6, IPv4-mapped/embedded IPv6. */
export function isBlockedIp(ip) {
  const s = String(ip).trim().replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  if (net.isIPv4(s)) { const n = num4(s); return BLOCK4.some(([b, bits]) => inV4(n, b, bits)); }
  if (!net.isIPv6(s)) return true;
  if (s === '::' || s === '::1') return true;
  const m4 = /^(?:::ffff:|::|64:ff9b::|2002:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);   // mapped / compatible / NAT64 with a dotted tail
  if (m4) return isBlockedIp(m4[1]);
  const mh = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(s);
  if (mh) { const a = parseInt(mh[1], 16), b = parseInt(mh[2], 16); return isBlockedIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
  const first = parseInt(s.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true;   // multicast
  if (s.startsWith('64:ff9b:') || s.startsWith('2001:db8') || s.startsWith('2001:0db8') || s.startsWith('100::')) return true;
  return false;
}

const BAD_HOST = /(^|\.)(localhost|local|internal|localdomain|lan|home|corp|intranet|ts\.net)$|^metadata\.google\.internal$|^instance-data$/i;

/** Static checks on a URL (no DNS). → URL, or throws GuardError. */
export function parseTarget(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new GuardError('not a web address', 'BAD_URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new GuardError(`only http and https addresses are fetched (not ${u.protocol})`, 'BAD_SCHEME');
  if (u.username || u.password) throw new GuardError('addresses with a login in them are not fetched', 'BAD_URL');
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  if (port !== '80' && port !== '443') throw new GuardError(`port ${port} is not allowed (80 and 443 only)`, 'BAD_PORT');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (BAD_HOST.test(host)) throw new GuardError(`${host} is an internal name`, 'BLOCKED');
  if ((net.isIP(host) || /^[\d.]+$/.test(host)) && isBlockedIp(host)) throw new GuardError(`${host} is a private or reserved address`, 'BLOCKED');
  return u;
}

/** A dns.lookup replacement for http.request({ lookup }): resolves ALL addresses, refuses if ANY is blocked, hands back the first. */
export function guardedLookup(resolve = dns.promises.lookup.bind(dns.promises)) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    resolve(hostname, { all: true, verbatim: true }).then((addrs) => {
      const list = Array.isArray(addrs) ? addrs : [addrs];
      if (!list.length) return cb(new GuardError(`${hostname} did not resolve`, 'DNS'));
      const bad = list.find((a) => isBlockedIp(a.address));
      if (bad) return cb(new GuardError(`${hostname} resolves to a private or reserved address`, 'BLOCKED'));
      if (options?.all) return cb(null, list.map((a) => ({ address: a.address, family: a.family })));
      cb(null, list[0].address, list[0].family);
    }, (e) => cb(Object.assign(new GuardError(`could not look up ${hostname}: ${e.code || e.message}`, 'DNS'), { cause: e })));
  };
}

const lastHit = new Map();
/** 1 request/second per host. */
export async function politeWait(host, { gapMs = 1000, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const wait = Math.max(0, (lastHit.get(host) || 0) + gapMs - now());
  lastHit.set(host, now() + wait);
  if (wait) await sleep(wait);
}

/** One request, no redirect following. → IncomingMessage. `transport` (tests) replaces node's http/https request. */
export function rawRequest(url, { method = 'GET', headers = {}, lookup, transport = null, timeoutMs = 30_000 } = {}) {
  const u = parseTarget(url);
  const mod = transport || (u.protocol === 'https:' ? https : http);
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method, headers: { 'user-agent': UA, accept: '*/*', ...headers }, lookup: lookup || guardedLookup(), timeout: timeoutMs, agent: false }, resolve);
    req.on('timeout', () => req.destroy(new GuardError('the server took too long to answer', 'TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

/** GET/HEAD following up to `maxRedirects` redirects, EVERY hop through the guard (scheme, port, name, resolved address). → { res, url, hops } */
export async function guardedRequest(url, { maxRedirects = 5, method = 'GET', headers = {}, lookup, transport, polite = true, politeOpts = {} } = {}) {
  let cur = String(url), hops = 0;
  for (;;) {
    const u = parseTarget(cur);
    if (polite) await politeWait(u.hostname, politeOpts);
    const res = await rawRequest(cur, { method, headers, lookup, transport });
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      res.resume();
      if (++hops > maxRedirects) throw new GuardError('too many redirects', 'REDIRECTS');
      cur = new URL(res.headers.location, cur).toString();
      continue;
    }
    return { res, url: cur, hops };
  }
}

// ── robots.txt ──
/** Parse robots.txt → rules for our agent (falls back to *). Longest matching rule wins; Allow beats Disallow on ties. Pure. */
export function robotsRules(text, agent = 'DeweyLibrarian') {
  const groups = []; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if ((k === 'allow' || k === 'disallow') && cur) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a))) || groups.find((g) => g.agents.includes('*'));
  return mine?.rules || [];
}
const globRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
export function robotsAllows(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (!globRe(r.path).test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}
/** May Dewey fetch this page? A missing robots.txt (404) allows; an unreachable one (5xx/timeout) refuses (be polite). */
export async function robotsAllowed(url, { fetchText } = {}) {
  const u = parseTarget(url);
  const get = fetchText || (async (robotsUrl) => {
    const { res } = await guardedRequest(robotsUrl, { polite: false, maxRedirects: 3 });
    if (res.statusCode === 404 || res.statusCode === 410) { res.resume(); return ''; }
    if (res.statusCode >= 400) { res.resume(); throw new GuardError(`robots.txt answered ${res.statusCode}`, 'ROBOTS'); }
    const chunks = []; let n = 0;
    for await (const c of res) { n += c.length; if (n > 512 * 1024) break; chunks.push(c); }
    return Buffer.concat(chunks).toString('utf8');
  });
  let text;
  try { text = await get(`${u.protocol}//${u.host}/robots.txt`); } catch (e) { return { allowed: false, why: `could not read robots.txt (${e.message})` }; }
  const ok = robotsAllows(robotsRules(text), u.pathname + u.search);
  return ok ? { allowed: true } : { allowed: false, why: `${u.hostname}'s robots.txt asks bots not to fetch this` };
}

/** Hosts the media pipeline owns (yt-dlp on a media worker): never fetched as files. */
export const MEDIA_HOST = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|soundcloud\.com|dailymotion\.com|twitch\.tv|bandcamp\.com)$/i;
export const isMediaPage = (url) => { try { return MEDIA_HOST.test(new URL(url).hostname); } catch { return false; } };

/** A SMALL guarded GET for tower-side identification only (a page title, a PDF's first look): hard byte cap, SSRF-guarded, robots-aware for pages.
 *  Anything bigger is refused with a pointer to fetch_url (a worker downloads it). → { status, type, buf, url } */
export async function boundedGet(url, { maxBytes = 5 * 1024 * 1024, request = guardedRequest, robots = robotsAllowed } = {}) {
  const { res, url: final } = await request(url, { maxRedirects: 4 });
  const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const len = Number(res.headers['content-length']) || 0;
  if (res.statusCode >= 400) { res.resume(); return { status: res.statusCode, type, buf: Buffer.alloc(0), url: final }; }
  if (len > maxBytes) { res.resume(); throw new GuardError(`that file is ${(len / 1024 ** 2).toFixed(0)} MB — too large to check here; I can download it on a worker instead (fetch_url)`, 'TOO_BIG'); }
  if (type.includes('html')) { const ok = await robots(final); if (!ok.allowed) { res.resume(); throw new GuardError(ok.why || 'robots.txt asks bots not to fetch this page', 'ROBOTS'); } }
  const chunks = []; let n = 0;
  for await (const c of res) { n += c.length; if (n > maxBytes) { res.destroy(); throw new GuardError('that file is too large to check here; I can download it on a worker instead (fetch_url)', 'TOO_BIG'); } chunks.push(c); }
  return { status: res.statusCode, type, buf: Buffer.concat(chunks), url: final };
}
