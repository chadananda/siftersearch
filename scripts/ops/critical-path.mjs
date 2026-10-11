#!/usr/bin/env node
// CRITICAL-PATH check (Chad 10-10, after a 30-min API outage nobody was told about: "a critical path set of regression
// tests including API health so that this never can happen again"). Exercises what visitors and Anís depend on, end to
// end, against PRODUCTION. Run after every deploy (the updater does) and on demand. Exit 1 if anything fails.
//   node scripts/ops/critical-path.mjs            public checks (from anywhere)
//   node scripts/ops/critical-path.mjs --local    + tower-only checks (pm2 processes, writer, internal search, S3 signed)
//   … --alert                                     email [ACTION REQUIRED] on failure (deduped; cleared on recovery)
//   … --json                                      machine-readable result
const SITE = process.env.CP_SITE || 'https://siftersearch.com';
const API = process.env.CP_API || 'https://api.siftersearch.com';
const LOCAL_API = 'http://127.0.0.1:7839';
const COVER_ID = 20760;   // a book with a stored cover (Additional Prayers…)

const get = async (url, { timeoutMs = 15000, headers = {}, method = 'GET', body, redirect = 'manual', fetchImpl = fetch } = {}) => {
  const t0 = Date.now();
  // a NETWORK error is retried (a flaky route must not read as an outage); an HTTP status is the server's answer and is not
  // (10-10: tower's own outbound connects took 0.1-1 s and sometimes hit undici's 10 s connect timeout while the home
  // uplink was saturated — three tries with backoff, so congestion reads as slow, and only a real outage as down)
  let r;
  for (let attempt = 1; ; attempt++) {
    try { r = await fetchImpl(url, { method, headers, body, redirect, signal: AbortSignal.timeout(timeoutMs) }); break; }
    catch (e) { if (attempt >= 3) throw new Error(`network: ${e.cause?.code || e.message}`); await new Promise((res) => setTimeout(res, 2000 * attempt)); }
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type') || '', bytes: buf.length, text: () => buf.toString('utf8'), ms: Date.now() - t0 };
};
const expect = (cond, detail) => { if (!cond) throw new Error(detail); };

/** Public checks — what a visitor's browser needs. */
export function publicChecks(o = {}) {
  const g = (u, x = {}) => get(u, { ...x, fetchImpl: o.fetchImpl || fetch });
  const page = (path, extra) => async () => {
    const r = await g(`${SITE}${path}`); expect(r.status === 200, `HTTP ${r.status}`);
    if (extra) extra(r.text()); return `${r.ms} ms`;
  };
  return [
    ['site: home', page('/', (h) => expect(h.includes('site-footer'), 'global footer missing'))],
    ['site: library', page('/library')],
    ['site: research', page('/research')],
    ['site: dialogue', page('/dialogue')],
    ['site: contact', page('/contact')],
    ['site: widget.js (Anís)', page('/widget.js')],
    ['admin pages require sign-in', async () => { const r = await g(`${SITE}/admin/workplan`); expect(r.status === 302, `HTTP ${r.status}, want 302`); return 'redirects'; }],
    ['API health (public tunnel)', async () => { const r = await g(`${API}/api/v1/health`, { timeoutMs: 8000 }); expect(r.status === 200, `HTTP ${r.status}`); return `${r.ms} ms`; }],
    ['API health (through the site)', async () => { const r = await g(`${SITE}/api/v1/health`, { timeoutMs: 8000 }); expect(r.status === 200, `HTTP ${r.status}`); return `${r.ms} ms`; }],
    ['library shelves index', async () => {
      const r = await g(`${API}/api/library/shelves`); expect(r.status === 200, `HTTP ${r.status}`);
      const n = JSON.parse(r.text()).traditions?.length || 0; expect(n > 0, 'no traditions'); return `${n} traditions, ${r.ms} ms`;
    }],
    ['library shelf expands', async () => {
      const r = await g(`${API}/api/library/shelves/items?religion=${encodeURIComponent("Baha'i")}&collection=Books&limit=2`);
      expect(r.status === 200, `HTTP ${r.status}`); expect((JSON.parse(r.text()).items || []).length > 0, 'no items'); return `${r.ms} ms`;
    }],
    ['search stats', async () => { const r = await g(`${API}/api/search/stats`); expect(r.status === 200, `HTTP ${r.status}`); return `${r.ms} ms`; }],
    ['image service (cover → WebP)', async () => {
      const r = await g(`${SITE}/img/covers/${COVER_ID}?tr=w-60,q-70`, { headers: { Accept: 'image/webp' }, timeoutMs: 20000 });
      expect(r.status === 200, `HTTP ${r.status}`); expect(/image\//.test(r.type), `type ${r.type}`); expect(r.bytes < 200000, `${r.bytes} B — not resized`);
      return `${r.bytes} B, ${r.ms} ms`;
    }],
    ['S3 gateway refuses unsigned', async () => { const r = await g(`https://s3.siftersearch.com/covers/${COVER_ID}/original.webp`); expect(r.status === 403, `HTTP ${r.status}, want 403`); return '403'; }],
    ['WorkPlan relay requires auth', async () => { const r = await g(`${SITE}/api/admin/workplan`); expect(r.status === 401, `HTTP ${r.status}, want 401`); return '401'; }],
  ];
}

/** Tower-only checks — the processes behind the public ones. */
export function localChecks(o = {}) {
  const run = o.run;            // (cmd) => stdout, injected so tests can fake pm2
  const g = (u, x = {}) => get(u, { ...x, fetchImpl: o.fetchImpl || fetch });
  return [
    ['pm2: critical processes online', async () => {
      const { CRITICAL_APPS } = await import('../../api/lib/ops/ecosystem-check.js');
      const list = JSON.parse(await run('pm2 jlist'));
      const bad = Object.keys(CRITICAL_APPS).filter((n) => list.find((p) => p.name === n)?.pm2_env?.status !== 'online');
      expect(!bad.length, `not online: ${bad.join(', ')}`);
      const api = list.find((p) => p.name === 'siftersearch-api');
      expect(api.pm2_env.exec_mode === 'cluster_mode', `API in ${api.pm2_env.exec_mode}, want cluster (zero-downtime reloads)`);
      return `${Object.keys(CRITICAL_APPS).length} online`;
    }],
    ['API health (local)', async () => { const r = await g(`${LOCAL_API}/api/v1/health`, { timeoutMs: 3000 }); expect(r.status === 200, `HTTP ${r.status}`); return `${r.ms} ms`; }],
    ['single writer', async () => { const r = await g('http://127.0.0.1:7849/health', { timeoutMs: 3000 }); expect(r.status === 200, `HTTP ${r.status}`); return `${r.ms} ms`; }],
    ['search (planned, internal)', async () => {
      const r = await g(`${LOCAL_API}/api/search/multi`, { method: 'POST', timeoutMs: 30000,
        headers: { 'Content-Type': 'application/json', 'X-Sifter-Test': '1', 'X-Internal-Key': process.env.DEPLOY_SECRET || '' },
        body: JSON.stringify({ query: 'The earth is but one country', limit: 5 }) });
      expect(r.status === 200, `HTTP ${r.status}`); const n = (JSON.parse(r.text()).hits || []).length; expect(n > 0, 'no hits');
      return `${n} hits, ${r.ms} ms`;
    }],
    ['S3 gateway signed list', async () => {
      const { AwsClient } = await import('aws4fetch');
      const aws = new AwsClient({ accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY, service: 's3', region: 'us-east-1' });
      const r = await aws.fetch('http://127.0.0.1:7070/', { signal: AbortSignal.timeout(5000) });
      expect(r.status === 200, `HTTP ${r.status}`); return 'ok';
    }],
  ];
}

/** Run checks; never throws. → { ok, results: [{ name, ok, detail }] } */
export async function runChecks(checks) {
  const results = [];
  for (const [name, fn] of checks) {
    try { results.push({ name, ok: true, detail: await fn() }); } catch (e) { results.push({ name, ok: false, detail: String(e?.message || e).slice(0, 200) }); }
  }
  return { ok: results.every((r) => r.ok), results };
}

const MAIN = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (MAIN) {
  const args = process.argv.slice(2);
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
  const { execSync } = await import('child_process');
  const checks = [...publicChecks(), ...(args.includes('--local') ? localChecks({ run: (c) => execSync(c, { encoding: 'utf8', maxBuffer: 64 << 20 }) }) : [])];
  const res = await runChecks(checks);
  if (args.includes('--json')) console.log(JSON.stringify(res));
  else for (const r of res.results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(36)} ${r.detail}`);
  if (args.includes('--alert')) {
    const { actionRequired, clearAlert } = await import('../../api/lib/ops/alert.js');
    if (res.ok) clearAlert('critical-path');
    else {
      const failed = res.results.filter((r) => !r.ok);
      await actionRequired({ key: 'critical-path', quietMs: 30 * 60 * 1000, subject: `SifterSearch critical path failing (${failed.length})`,
        text: `${failed.map((r) => `✗ ${r.name}: ${r.detail}`).join('\n')}\n\nAll checks:\n${res.results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name}: ${r.detail}`).join('\n')}\n\nRe-run: node scripts/ops/critical-path.mjs --local` });
    }
  }
  process.exit(res.ok ? 0 : 1);
}
