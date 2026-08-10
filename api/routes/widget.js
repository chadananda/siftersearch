// SifterChat embeddable widget + its admin console (planning/sifterchat-widget-plan.md).
// PUBLIC surface: the loader (/widget.js), the compiled element (/widget/sifter-chat.js), per-token config
// (/api/v1/widget/config/:token, origin-checked), and event ingestion (/api/v1/widget/events). Chat itself
// reuses the existing Jafar endpoint (/api/chat/stream). CORS for host origins is granted in server.js from
// widget_profiles.domains.
// ADMIN surface (X-Internal-Key === DEPLOY_SECRET, same gate as the grounding control plane): profile CRUD +
// per-profile analytics, and a self-contained console page (/widget-admin). Served from the API — not CF Pages —
// so it ships via the backend deploy path (the Astro build is unavailable here). The HOUSE profile (is_house=1,
// siftersearch.com) is the internal lab and cannot be deleted.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { query, queryAll, queryOne } from '../lib/db.js';
import { requireInternal } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = join(__dirname, '..', 'static', 'widget');
const loadAsset = (file) => { try { return readFileSync(join(STATIC_DIR, file), 'utf8'); } catch { return null; } };
const ASSETS = { 'widget.js': loadAsset('widget.js'), 'sifter-chat.js': loadAsset('sifter-chat.js') };
const DEMO_HTML = loadAsset('demo.html');
const ADMIN_HTML = loadAsset('admin.html');

const originHost = (origin) => { try { return new URL(origin).hostname; } catch { return null; } };
const DEV_HOSTS = new Set(['localhost', '127.0.0.1']);
const parseJSON = (s, dflt) => { try { return JSON.parse(s); } catch { return dflt; } };
const EVENT_TYPES = new Set(['widget_load', 'open', 'message_sent', 'answer_served', 'site_link_clicked', 'upgrade_shown',
  'onetap_shown', 'onetap_connected', 'onetap_snoozed']);

// Shape a profile row → the admin-facing object (parsed JSON, embed snippet).
function profileView(row, apiOrigin) {
  return {
    id: row.id, token: row.token, name: row.name, tier: row.tier, isHouse: !!row.is_house,
    domains: parseJSON(row.domains, []), config: parseJSON(row.config_json, {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
    embed: `<script src="${apiOrigin}/widget.js" data-key="${row.token}" async></script>`,
  };
}

export default async function widgetRoutes(fastify) {
  const admin = { preHandler: requireInternal };
  // ONE public domain: embeds advertise siftersearch.com (the edge worker proxies /widget* + /api/*
  // to this backend). api.siftersearch.com remains only the internal tunnel leg the worker calls.
  const apiOrigin = () => (process.env.PUBLIC_WIDGET_ORIGIN || 'https://siftersearch.com').replace(/\/$/, '');

  // ── Static assets (long-cached; bundle versioned by deploy) ─────────────────────────────────────────────────
  for (const [file, body] of Object.entries(ASSETS)) {
    const path = file === 'widget.js' ? '/widget.js' : '/widget/sifter-chat.js';
    fastify.get(path, async (req, reply) => {
      if (!body) return reply.code(404).send('// widget asset not built — run: npm run build:widget');
      return reply.header('content-type', 'application/javascript; charset=utf-8')
        .header('cache-control', 'public, max-age=300, s-maxage=300')
        .header('access-control-allow-origin', '*').send(body);
    });
  }

  // Demo page — accepts ?key= so any profile (incl. the house lab) is testable without touching a host site.
  fastify.get('/widget/demo', async (req, reply) => {
    if (!DEMO_HTML) return reply.code(404).send('demo not built');
    return reply.header('content-type', 'text/html; charset=utf-8').send(DEMO_HTML);
  });

  // ── One Tap intermediate iframe ──────────────────────────────────────────────────────────────────────────────
  // Reached as siftersearch.com/widget/onetap (worker-proxied; that origin is registered in Google Console),
  // embedded as an iframe by the widget on ANY host site — so host sites never register anything with Google.
  // The parent iframe tag must carry
  // allow="identity-credentials-get" (FedCM). Credential → POST /api/v1/widget/onetap (same-origin) → postMessage
  // {type:'sifter-onetap', ok, email, name} to the parent widget.
  fastify.get('/widget/onetap', async (req, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return reply.code(503).send('One Tap not configured');
    const key = String(req.query.key || '');
    const row = await queryOne(`SELECT token FROM widget_profiles WHERE token=?`, [key]);
    if (!row) return reply.code(403).send('unknown widget key');
    const sid = String(req.query.session || '').slice(0, 64);
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;font:14px/1.4 ui-sans-serif,system-ui,sans-serif;color:#5a6172}
.wrap{display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 6px}
#note{font-size:12px;color:#8b92a1;text-align:center}</style></head><body>
<div class="wrap"><div id="btn"></div><div id="note"></div></div>
<script>
var KEY=${JSON.stringify(row.token)}, SID=${JSON.stringify(sid)}, CID=${JSON.stringify(clientId)};
function post(m){ try{ parent.postMessage(Object.assign({type:'sifter-onetap'},m),'*'); }catch(e){} }
function onCred(resp){
  fetch('/api/v1/widget/onetap',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({credential:resp.credential,token:KEY,sessionId:SID})})
  .then(function(r){ return r.json().then(function(j){ return {r:r,j:j}; }); })
  .then(function(x){ if(x.r.ok&&x.j.ok){ post({ok:true,email:x.j.email,name:x.j.name,picture:x.j.picture||null}); }
    else { document.getElementById('note').textContent='Connection failed — please try again.'; post({ok:false,error:x.j.error||('status '+x.r.status)}); } })
  .catch(function(e){ post({ok:false,error:String(e&&e.message||e)}); });
}
function init(){
  google.accounts.id.initialize({client_id:CID,callback:onCred,use_fedcm_for_prompt:true,context:'use',cancel_on_tap_outside:false,itp_support:true});
  google.accounts.id.renderButton(document.getElementById('btn'),{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'pill',width:270});
  google.accounts.id.prompt();
}
</script>
<script src="https://accounts.google.com/gsi/client" async onload="init()"></script>
</body></html>`;
    return reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store').send(html);
  });

  // Credential sink: verify the Google ID token server-side (Google's tokeninfo validates the signature;
  // we validate audience + verified email), then upsert the connection and send a welcome email (best-effort).
  fastify.post('/api/v1/widget/onetap', async (req, reply) => {
    const { credential, token, sessionId } = req.body || {};
    if (!credential || !token) return reply.code(400).send({ ok: false, error: 'credential and token required' });
    const profile = await queryOne(`SELECT token, name FROM widget_profiles WHERE token=?`, [token]);
    if (!profile) return reply.code(403).send({ ok: false, error: 'unknown widget key' });
    let info;
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return reply.code(401).send({ ok: false, error: 'invalid credential' });
      info = await r.json();
    } catch {
      return reply.code(502).send({ ok: false, error: 'verification unavailable' });
    }
    if (info.aud !== process.env.GOOGLE_CLIENT_ID) return reply.code(401).send({ ok: false, error: 'audience mismatch' });
    if (info.email_verified !== 'true' && info.email_verified !== true) return reply.code(401).send({ ok: false, error: 'email not verified' });
    const email = String(info.email || '').slice(0, 254);
    const sub = String(info.sub || '');
    if (!email || !sub) return reply.code(401).send({ ok: false, error: 'incomplete credential' });
    const name = String(info.name || '').slice(0, 120) || null;
    await query(`INSERT INTO widget_connections (token, session_id, email, google_sub, name, picture)
                 VALUES (?,?,?,?,?,?)
                 ON CONFLICT(token, google_sub) DO UPDATE SET
                   session_id=excluded.session_id, email=excluded.email, name=excluded.name,
                   picture=excluded.picture, unsubscribed_at=NULL`,
      [profile.token, String(sessionId || '').slice(0, 64) || null, email, sub, name, String(info.picture || '').slice(0, 500) || null]);
    logger.info({ token: profile.token, email }, 'widget One Tap connection');
    try {
      const { sendEmail } = await import('../services/email.js');
      await sendEmail({
        to: email,
        subject: `You're connected to ${profile.name}`,
        text: `Hello${name ? ` ${name}` : ''},\n\nYou've connected your Google account to ${profile.name}, powered by Ocean research.\n\nFrom time to time we'll send you a detailed summary of your research conversations — the passages found, the sources cited, and links to read further in the original texts.\n\nIf you'd rather not receive these, just reply to this email with "stop".\n\n— The Ocean Library`,
      });
    } catch (e) { logger.warn({ err: e.message }, 'One Tap welcome email failed (connection still saved)'); }
    return { ok: true, email, name, picture: String(info.picture || '') || null };
  });

  // Admin console (self-contained HTML+JS; prompts for the internal key, admin-only).
  fastify.get('/widget-admin', async (req, reply) => {
    if (!ADMIN_HTML) return reply.code(404).send('admin console not built');
    return reply.header('content-type', 'text/html; charset=utf-8').send(ADMIN_HTML);
  });

  // ── Per-token config (public, origin-checked) ───────────────────────────────────────────────────────────────
  fastify.get('/api/v1/widget/config/:token', async (req, reply) => {
    const row = await queryOne(`SELECT token, name, domains, tier, config_json FROM widget_profiles WHERE token=?`, [req.params.token]);
    if (!row) return reply.code(404).send({ error: 'unknown widget token' });
    const domains = parseJSON(row.domains, []); const cfg = parseJSON(row.config_json, {});
    const origin = req.headers.origin; const host = origin ? originHost(origin) : null;
    if (origin && !(domains.includes(host) || DEV_HOSTS.has(host))) {
      logger.warn({ token: row.token, origin }, 'widget config refused: origin not in profile domains');
      return reply.code(403).send({ error: 'origin not authorized for this widget token' });
    }
    return reply.header('cache-control', 'public, max-age=60, s-maxage=300').send({
      token: row.token, name: row.name,
      greeting: cfg.greeting || 'Hello! Ask me anything about the sacred literature.',
      accent: cfg.accent || '#1a6b5e', position: cfg.position || 'bottom-right',
      chatbotLocation: cfg.chatbotLocation || null, placeholder: cfg.placeholder || 'Ask a question…',
    });
  });

  // ── Event ingestion (public; from the widget via sendBeacon) ─────────────────────────────────────────────────
  // Accepts a small batch. Silently drops unknown tokens/types (never a hard error on a beacon). Question text
  // rides message_sent.meta for the ADMIN content-gap view only (admin-gated read; documented as admin-scope).
  fastify.post('/api/v1/widget/events', async (req, reply) => {
    const { token, sessionId, events } = req.body || {};
    if (!token || !Array.isArray(events) || !events.length) return reply.code(204).send();
    const exists = await queryOne(`SELECT 1 ok FROM widget_profiles WHERE token=?`, [token]);
    if (!exists) return reply.code(204).send();
    for (const ev of events.slice(0, 20)) {
      if (!EVENT_TYPES.has(ev?.type)) continue;
      const meta = ev.meta && typeof ev.meta === 'object' ? JSON.stringify(ev.meta).slice(0, 2000) : null;
      await query(`INSERT INTO widget_events (token, type, session_id, meta_json, ts) VALUES (?,?,?,?,?)`,
        [token, ev.type, String(sessionId || '').slice(0, 64) || null, meta,
         Number.isFinite(ev.ts) ? Math.floor(ev.ts / 1000) : Math.floor(Date.now() / 1000)]);
    }
    return reply.code(204).send();
  });

  // ── ADMIN: profile CRUD + analytics (internal-key gated) ─────────────────────────────────────────────────────
  fastify.get('/api/v1/widget/admin/profiles', admin, async () => {
    const rows = await queryAll(`SELECT * FROM widget_profiles ORDER BY is_house DESC, id ASC`);
    // Cheap headline stats per token (last 30d), joined in JS to keep the SQL simple.
    const stats = {};
    (await queryAll(`SELECT token,
        SUM(type='message_sent') messages,
        COUNT(DISTINCT session_id) sessions,
        MAX(ts) last_ts
      FROM widget_events WHERE ts >= strftime('%s','now','-30 days') GROUP BY token`))
      .forEach((r) => { stats[r.token] = { messages: r.messages || 0, sessions: r.sessions || 0, lastTs: r.last_ts || null }; });
    return { profiles: rows.map((r) => ({ ...profileView(r, apiOrigin()), stats: stats[r.token] || { messages: 0, sessions: 0, lastTs: null } })) };
  });

  fastify.post('/api/v1/widget/admin/profiles', admin, async (req, reply) => {
    const { name, domains = [], config = {}, tier = 'free' } = req.body || {};
    if (!name || !String(name).trim()) return reply.code(400).send({ error: 'name required' });
    const token = 'wgt_' + nanoid(16);
    const doms = Array.isArray(domains) ? domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean) : [];
    await query(`INSERT INTO widget_profiles (token, name, domains, tier, config_json) VALUES (?,?,?,?,?)`,
      [token, String(name).trim(), JSON.stringify(doms), tier, JSON.stringify(config || {})]);
    const row = await queryOne(`SELECT * FROM widget_profiles WHERE token=?`, [token]);
    logger.info({ token, name }, 'widget profile created');
    return profileView(row, apiOrigin());
  });

  fastify.patch('/api/v1/widget/admin/profiles/:id', admin, async (req, reply) => {
    const row = await queryOne(`SELECT * FROM widget_profiles WHERE id=?`, [Number(req.params.id)]);
    if (!row) return reply.code(404).send({ error: 'profile not found' });
    const b = req.body || {};
    const name = b.name != null ? String(b.name).trim() : row.name;
    const domains = Array.isArray(b.domains) ? JSON.stringify(b.domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean)) : row.domains;
    const config = b.config != null ? JSON.stringify(b.config) : row.config_json;
    const tier = b.tier != null ? String(b.tier) : row.tier;
    await query(`UPDATE widget_profiles SET name=?, domains=?, config_json=?, tier=?, updated_at=unixepoch() WHERE id=?`,
      [name, domains, config, tier, row.id]);
    return profileView(await queryOne(`SELECT * FROM widget_profiles WHERE id=?`, [row.id]), apiOrigin());
  });

  fastify.delete('/api/v1/widget/admin/profiles/:id', admin, async (req, reply) => {
    const row = await queryOne(`SELECT * FROM widget_profiles WHERE id=?`, [Number(req.params.id)]);
    if (!row) return reply.code(404).send({ error: 'profile not found' });
    if (row.is_house) return reply.code(409).send({ error: 'the house profile is permanent and cannot be deleted' });
    await query(`DELETE FROM widget_profiles WHERE id=?`, [row.id]);
    logger.info({ token: row.token }, 'widget profile deleted');
    return { deleted: true, token: row.token };
  });

  // Per-profile analytics: daily event counts + recent questions (admin content-gap view).
  fastify.get('/api/v1/widget/admin/profiles/:id/analytics', admin, async (req, reply) => {
    const row = await queryOne(`SELECT * FROM widget_profiles WHERE id=?`, [Number(req.params.id)]);
    if (!row) return reply.code(404).send({ error: 'profile not found' });
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 180);
    const since = `strftime('%s','now','-${days} days')`;
    const totals = await queryOne(`SELECT
        SUM(type='widget_load') loads, SUM(type='open') opens, SUM(type='message_sent') messages,
        SUM(type='answer_served') answers, COUNT(DISTINCT session_id) sessions
      FROM widget_events WHERE token=? AND ts >= ${since}`, [row.token]);
    const daily = await queryAll(`SELECT date(ts,'unixepoch') day,
        SUM(type='message_sent') messages, COUNT(DISTINCT session_id) sessions
      FROM widget_events WHERE token=? AND ts >= ${since} GROUP BY day ORDER BY day`, [row.token]);
    const avgLatency = await queryOne(`SELECT ROUND(AVG(CAST(json_extract(meta_json,'$.latencyMs') AS REAL))) ms
      FROM widget_events WHERE token=? AND type='answer_served' AND ts >= ${since}`, [row.token]);
    const recentQuestions = (await queryAll(`SELECT json_extract(meta_json,'$.q') q, datetime(ts,'unixepoch') at
      FROM widget_events WHERE token=? AND type='message_sent' AND json_extract(meta_json,'$.q') IS NOT NULL
      ORDER BY ts DESC LIMIT 50`, [row.token])).map((r) => ({ q: r.q, at: r.at }));
    return {
      profile: profileView(row, apiOrigin()), days,
      totals: { loads: totals?.loads || 0, opens: totals?.opens || 0, messages: totals?.messages || 0, answers: totals?.answers || 0, sessions: totals?.sessions || 0, avgLatencyMs: avgLatency?.ms || null },
      daily, recentQuestions,
    };
  });
}
