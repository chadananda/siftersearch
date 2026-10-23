// ZeptoMail (Zoho) for Dewey's letters from dewey@siftersearch.com (Chad 10-23: siftersearch.com mail is not AWS). Send through
// the v1.1 API with the 'siftersearch' mail agent's send token (Worker secrets ZEPTO_API_KEY + ZEPTO_HOST, the same values as .env-secrets); threading via mime_headers; no open/click
// tracking. Bounces and complaints arrive on POST /_mail/zepto/events (webhook token ZEPTO_WEBHOOK_KEY) → mail_events +
// mail_suppression, shared with Anís. Pure builders + one fetch each.
const lower = (s) => String(s || '').trim().toLowerCase();

/** The API body. Pure. */
export function zeptoPayload({ from, fromName, to, toName = null, subject, text, html, inReplyTo = null, references = null, reference = null, headers = null }) {
  const mime = { ...(headers || {}) };
  if (inReplyTo) mime['In-Reply-To'] = inReplyTo;
  if (references || inReplyTo) mime.References = references || inReplyTo;
  return {
    from: { address: from, name: fromName }, to: [{ email_address: { address: to, ...(toName ? { name: toName } : {}) } }],
    reply_to: [{ address: from, name: fromName }], subject, textbody: text, ...(html ? { htmlbody: html } : {}),
    track_clicks: false, track_opens: false, ...(reference ? { client_reference: String(reference) } : {}), ...(Object.keys(mime).length ? { mime_headers: mime } : {}),
  };
}

/** Send one letter. → { requestId } | { error } */
export async function zeptoSend(env, opts, fetchImpl = fetch) {
  const key = env.ZEPTO_API_KEY;
  if (!key) return { error: 'no ZeptoMail key (Worker secret ZEPTO_API_KEY)', unconfigured: true };
  const res = await fetchImpl(`https://${env.ZEPTO_HOST || 'api.zeptomail.com'}/v1.1/email`, {
    method: 'POST', headers: { Authorization: key.startsWith('Zoho-enczapikey') ? key : `Zoho-enczapikey ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(zeptoPayload(opts)),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { error: [j.error?.code, j.error?.message, ...(j.error?.details || []).map((d) => `${d.code} ${d.message}`)].filter(Boolean).join(' · ') || `zeptomail ${res.status}` };
  return { requestId: j.request_id || null };
}

const TYPE = { hardbounce: 'Bounce', softbounce: 'DeliveryDelay', feedback_loop: 'Complaint', email_open: 'Open', email_link_click: 'Click' };
/** A ZeptoMail webhook body → { type, raw, events: [{ id, recipient, detail }], suppress: [{ email, reason }] }. Pure; tolerant of shape. */
export function zeptoEventRows(body = {}) {
  const raw = [].concat(body.event_name || [])[0] || 'unknown';
  const type = TYPE[raw] || raw;
  const events = [], suppress = [];
  for (const m of [].concat(body.event_message || [])) {
    const rcpts = new Set();
    for (const d of [].concat(m.event_data || [])) for (const x of [].concat(d.details || [])) if (x.bounced_recipient) rcpts.add(lower(x.bounced_recipient));
    if (!rcpts.size) for (const t of [].concat(m.email_info?.to || [])) if (t.email_address?.address) rcpts.add(lower(t.email_address.address));
    const id = m.request_id || m.email_info?.client_reference || null;
    for (const r of rcpts.size ? rcpts : [null]) {
      events.push({ id, recipient: r, detail: m.event_data || null });
      if (r && (raw === 'hardbounce' || raw === 'feedback_loop')) suppress.push({ email: r, reason: raw === 'hardbounce' ? 'bounce' : 'complaint' });
    }
  }
  return { type, raw, events, suppress };
}

/** POST /_mail/zepto/events?k=<ZEPTO_WEBHOOK_KEY> (or Authorization: <key>) — recorded once per (request, recipient, type). */
export async function zeptoEvents(request, env) {
  const k = new URL(request.url).searchParams.get('k') || request.headers.get('authorization');
  if (!env.ZEPTO_WEBHOOK_KEY || k !== env.ZEPTO_WEBHOOK_KEY) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let body; try { body = await request.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const r = zeptoEventRows(body);
  const db = env.ANIS_DB;
  const stmts = r.events.map((e, i) => db.prepare(`INSERT OR IGNORE INTO mail_events (sns_id, ses_message_id, event_type, recipient, detail_json) VALUES (?, ?, ?, ?, ?)`)
    .bind(`zepto:${e.id || Date.now()}:${r.raw}:${e.recipient || i}`, e.id, r.type, e.recipient, e.detail ? JSON.stringify(e.detail).slice(0, 4000) : null));
  for (const s of r.suppress) stmts.push(db.prepare('INSERT OR IGNORE INTO mail_suppression (email, reason) VALUES (?, ?)').bind(s.email, s.reason));
  if (stmts.length) await db.batch(stmts);
  return Response.json({ recorded: r.type, n: r.events.length, suppressed: r.suppress.length });
}
