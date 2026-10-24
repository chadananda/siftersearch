// Dewey browser-direct multipart uploads to R2 (MEDIA_BUCKET, prefix dewey-uploads/). Edge-only: bytes never touch tower or the tunnel.
// Tower authorises (POST /api/dewey/upload/start → HMAC token); this file validates the token, drives R2 multipart, then tells tower (finish).
// Pure policy + token helpers are shared with api/routes/dewey-upload.js (Web Crypto: works in Workers and Node).

const GB = 1024 ** 3, MB = 1024 ** 2;
export const KINDS = {
  document: { ext: 'pdf docx doc rtf odt txt md html htm epub', max: 5 * GB },
  image: { ext: 'jpg jpeg png tif tiff heic webp gif', max: 1 * GB },
  audio: { ext: 'mp3 m4a aac wav flac ogg opus aiff aif wma', max: 50 * GB },
  video: { ext: 'mp4 m4v mov mkv webm avi', max: 50 * GB },
};
export const PART_SIZE = 32 * MB;          // R2 parts must be equal-sized except the last; 5 MiB minimum
export const MAX_PART = 48 * MB;           // a part above this is refused (Worker request bodies are limited)
export const TOKEN_TTL = 3 * 24 * 3600;    // seconds: resumable for 3 days (R2 lifecycle rule dewey-abort-stale aborts unfinished multiparts after 3)
export const PREFIX = 'dewey-uploads/';

const EXT = Object.fromEntries(Object.entries(KINDS).flatMap(([kind, v]) => v.ext.split(' ').map((e) => [e, kind])));
export const extOf = (name) => (String(name).match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
export const kindOf = (name) => EXT[extOf(name)] || null;
export const safeName = (name) => String(name).split(/[\\/]/).pop().normalize('NFC').replace(/[^\p{L}\p{N}._ ()-]+/gu, '_').replace(/^\.+/, '').slice(0, 120) || 'file';
export const partCount = (size) => Math.max(1, Math.ceil(size / PART_SIZE));

/** Validate a start request → { ok, kind, error }. Pure. */
export function checkStart({ name, size }) {
  const kind = kindOf(name);
  if (!kind) return { ok: false, error: `"${safeName(name)}" is not a type Dewey accepts (PDF, Word, EPUB, text, images, audio, video)` };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'the file is empty' };
  if (size > KINDS[kind].max) return { ok: false, error: `"${safeName(name)}" is too large (${kind} files may be up to ${Math.round(KINDS[kind].max / GB)} GB)` };
  return { ok: true, kind };
}

/** First-bytes check for the types that have a signature. null when fine, else a message. */
export function sniff(name, head) {
  const b = new Uint8Array(head).slice(0, 8), hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  const e = extOf(name);
  if (e === 'pdf' && !hex.startsWith('25504446')) return 'this is not a PDF file';
  if (['jpg', 'jpeg'].includes(e) && !hex.startsWith('ffd8ff')) return 'this is not a JPEG image';
  if (e === 'png' && !hex.startsWith('89504e47')) return 'this is not a PNG image';
  if (['docx', 'epub'].includes(e) && !hex.startsWith('504b')) return `this is not a ${e.toUpperCase()} file`;
  return null;
}

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hmacKey = (secret, usage) => crypto.subtle.importKey('raw', enc.encode(`${secret}|dewey-upload`), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

/** token = base64url(payload).base64url(hmac). payload { k key, u user id, e email, s size, n name, t kind, x expiry (s) } */
export async function signToken(payload, secret, now = Date.now()) {
  const body = b64u(enc.encode(JSON.stringify({ ...payload, x: payload.x ?? Math.floor(now / 1000) + TOKEN_TTL })));
  return `${body}.${b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(body)))}`;
}
export async function verifyToken(token, secret, now = Date.now()) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !secret) return null;
  try {
    if (!await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), unb64u(sig), enc.encode(body))) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return p.x * 1000 > now && String(p.k).startsWith(PREFIX) ? p : null;
  } catch { return null; }
}

const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const TOWER = 'https://api.siftersearch.com';

/** Worker routes: POST init · PUT part · POST complete · POST abort · GET /_dewey/blob (internal). Returns a Response, or null for any other path. */
export async function deweyUploadRoute(request, env, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/_dewey/blob' && request.method === 'GET') {   // tower pulls a small document through here (internal key only)
    if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return json({ error: 'unauthorized' }, 401);
    const key = url.searchParams.get('key') || '';
    if (!key.startsWith(PREFIX) || key.includes('..')) return json({ error: 'bad key' }, 400);
    const obj = await env.MEDIA_BUCKET.get(key);
    return obj ? new Response(obj.body, { headers: { 'content-length': String(obj.size) } }) : json({ error: 'not found' }, 404);
  }
  if (path === '/_dewey/blob' && request.method === 'DELETE') {
    if (!env.S1_KEY || request.headers.get('x-internal-key') !== env.S1_KEY) return json({ error: 'unauthorized' }, 401);
    const key = url.searchParams.get('key') || '';
    if (!key.startsWith(PREFIX) || key.includes('..')) return json({ error: 'bad key' }, 400);
    await env.MEDIA_BUCKET.delete(key);
    return json({ deleted: key });
  }
  if (!path.startsWith('/api/dewey/upload/') || !['init', 'part', 'complete', 'abort'].includes(path.split('/').pop())) return null;
  if (!env.MEDIA_BUCKET || !env.S1_KEY) return json({ error: 'uploads are not configured' }, 503);
  const op = path.split('/').pop();
  const tok = await verifyToken(request.headers.get('x-upload-token'), env.S1_KEY);
  if (!tok) return json({ error: 'upload permission expired — start the upload again' }, 401);

  if (op === 'init' && request.method === 'POST') {
    const up = await env.MEDIA_BUCKET.createMultipartUpload(tok.k, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { user: String(tok.u), name: tok.n } });
    return json({ uploadId: up.uploadId, key: tok.k, partSize: PART_SIZE, parts: partCount(tok.s) });
  }
  const uploadId = url.searchParams.get('uploadId') || '';
  if (!uploadId) return json({ error: 'uploadId required' }, 400);
  const up = env.MEDIA_BUCKET.resumeMultipartUpload(tok.k, uploadId);

  if (op === 'part' && request.method === 'PUT') {
    const n = Number(url.searchParams.get('n'));
    if (!Number.isInteger(n) || n < 1 || n > partCount(tok.s)) return json({ error: 'bad part number' }, 400);
    const len = Number(request.headers.get('content-length'));
    if (!len || len > MAX_PART) return json({ error: `a part must be 1 byte to ${MAX_PART / MB} MB` }, 413);
    if (n < partCount(tok.s) && len !== PART_SIZE) return json({ error: `parts must be ${PART_SIZE / MB} MB except the last` }, 400);
    try {
      const [probe, body] = n === 1 ? request.body.tee() : [null, request.body];
      if (probe) {   // first bytes of the file: does the content match the extension?
        const r = probe.getReader(); const { value } = await r.read(); r.cancel().catch(() => {});
        const bad = sniff(tok.n, value || new Uint8Array());
        if (bad) { await up.abort().catch(() => {}); return json({ error: bad }, 415); }
      }
      const part = await up.uploadPart(n, body);
      return json({ n, etag: part.etag });
    } catch (e) { return json({ error: `part failed: ${String(e.message).slice(0, 120)}` }, 502); }
  }
  if (op === 'abort' && request.method === 'POST') { await up.abort().catch(() => {}); return json({ aborted: true }); }
  if (op === 'complete' && request.method === 'POST') {
    const { parts } = await request.json().catch(() => ({}));
    if (!Array.isArray(parts) || parts.length !== partCount(tok.s)) return json({ error: 'parts are missing', expected: partCount(tok.s) }, 400);
    let obj;
    try { obj = await up.complete(parts.map((p) => ({ partNumber: p.n, etag: p.etag })).sort((a, b) => a.partNumber - b.partNumber)); }
    catch (e) {   // a retry after tower failed: the object may already be assembled
      obj = await env.MEDIA_BUCKET.head(tok.k);
      if (!obj) return json({ error: `could not assemble the file: ${String(e.message).slice(0, 120)}` }, 409);
    }
    if (obj.size !== tok.s) { await env.MEDIA_BUCKET.delete(tok.k); return json({ error: `the file arrived as ${obj.size} bytes, expected ${tok.s}` }, 422); }
    const res = await fetchImpl(`${TOWER}/api/dewey/upload/finish`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': env.S1_KEY },
      body: JSON.stringify({ key: tok.k, size: obj.size, name: tok.n, kind: tok.t, userId: tok.u, email: tok.e }) });
    if (!res.ok) return json({ error: `stored, but Dewey could not record it yet (${res.status}); press retry` }, 502);
    return json(await res.json());
  }
  return json({ error: 'method not allowed' }, 405);
}
