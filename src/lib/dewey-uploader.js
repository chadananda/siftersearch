// Dewey's upload queue (browser): many files, 2 at a time, 3 parts at a time each, straight to the edge Worker → R2.
// Resume: the upload id and every part's etag persist in localStorage keyed by name|size|lastModified, so re-adding the same file
// after a refresh or a dropped connection sends only the missing parts. Deps are injectable (tests).
import { checkStart, partSizeFor } from '../../worker/dewey-upload.js';

const STORE = 'dewey-uploads-v1', TTL_MS = 2.9 * 24 * 3600_000;
export const fingerprint = (f) => `${f.name}|${f.size}|${f.lastModified || 0}`;

export function makeStore(storage = globalThis.localStorage) {
  const all = () => { try { return JSON.parse(storage.getItem(STORE) || '{}'); } catch { return {}; } };
  const put = (o) => { try { storage.setItem(STORE, JSON.stringify(o)); } catch { /* private mode / full: resume simply is not available */ } };
  return { get: (k) => { const s = all()[k]; return s && Date.now() - s.at < TTL_MS ? s : null; },
    list: () => Object.entries(all()).filter(([, v]) => Date.now() - v.at < TTL_MS).map(([k, v]) => ({ fp: k, name: k.split('|')[0], size: v.size, done: Object.keys(v.etags || {}).length, parts: v.parts })),
    set: (k, v) => put({ ...all(), [k]: { ...v, at: v.at || Date.now() } }), del: (k) => { const o = all(); delete o[k]; put(o); } };
}

/** XHR part upload (fetch cannot report upload progress). */
export function xhrPut(url, blob, headers, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    x.onload = () => { let body = {}; try { body = JSON.parse(x.responseText); } catch { /* not json */ } resolve({ status: x.status, body }); };
    x.onerror = () => reject(new Error('network')); x.ontimeout = () => reject(new Error('network'));
    signal?.addEventListener('abort', () => { x.abort(); reject(Object.assign(new Error('aborted'), { aborted: true })); });
    x.send(blob);
  });
}

export class UploadQueue {
  constructor({ authHeaders = () => ({}), base = '', fetchImpl = (...a) => fetch(...a), putPart = xhrPut, storage, fileConcurrency = 2, partConcurrency = 4, maxParts = 6,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onChange = () => {}, retries = 6 } = {}) {
    Object.assign(this, { authHeaders, base, fetchImpl, putPart, fileConcurrency, partConcurrency, maxParts, sleep, onChange, retries });
    this.inflight = 0; this.good = 0; this.samples = [];
    this.store = makeStore(storage); this.items = []; this.seq = 0;
  }
  add(files) {
    for (const f of files) {
      const fp = fingerprint(f), dup = this.items.find((i) => i.fp === fp && !['done', 'canceled', 'error'].includes(i.state));
      if (dup) continue;
      const c = checkStart({ name: f.name, size: f.size });
      const it = { id: ++this.seq, fp, file: f, name: f.name, size: f.size, state: c.ok ? 'queued' : 'rejected', error: c.ok ? null : c.error, sent: 0, partBytes: {}, ctl: null };
      this.items.push(it);
    }
    this.emit(); this.pump(); return this.items;
  }
  emit() { this.onChange(this.items); }
  progress() {
    const live = this.items.filter((i) => i.state !== 'rejected' && i.state !== 'canceled');
    const total = live.reduce((a, i) => a + i.size, 0), sent = live.reduce((a, i) => a + (i.state === 'done' ? i.size : Math.min(i.sent, i.size)), 0);
    const now = Date.now(); this.samples = [...this.samples.filter((s) => now - s.t < 20000), { t: now, sent }];
    const a = this.samples[0], span = (now - a.t) / 1000, bps = span >= 2 ? Math.max(0, (sent - a.sent) / span) : 0;
    return { total, sent, pct: total ? Math.floor((sent / total) * 100) : 0, files: live.length, done: live.filter((i) => i.state === 'done').length,
      bps, etaSec: bps > 1024 ? Math.ceil((total - sent) / bps) : null, parallel: this.partConcurrency };
  }
  pump() {
    const running = this.items.filter((i) => i.state === 'uploading').length;
    for (const it of this.items.filter((i) => i.state === 'queued').slice(0, Math.max(0, this.fileConcurrency - running))) this.run(it);
  }
  pause(id) { const it = this.get(id); if (it?.state === 'uploading' || it?.state === 'queued') { it.ctl?.abort(); it.state = 'paused'; this.emit(); this.pump(); } }
  resume(id) { const it = this.get(id); if (it && ['paused', 'error'].includes(it.state)) { it.state = 'queued'; it.error = null; this.emit(); this.pump(); } }
  retry(id) { this.resume(id); }
  async cancel(id) {
    const it = this.get(id); if (!it) return;
    it.ctl?.abort(); it.state = 'canceled';
    const s = this.store.get(it.fp); this.store.del(it.fp);
    if (s?.uploadId) await this.fetchImpl(`${this.base}/api/dewey/upload/abort?uploadId=${encodeURIComponent(s.uploadId)}`, { method: 'POST', headers: { 'x-upload-token': s.token } }).catch(() => {});
    this.emit(); this.pump();
  }
  // adaptive: a slow or dropping connection halves the parts in flight (min 1); eight clean parts in a row add one (max maxParts)
  slower() { this.good = 0; this.partConcurrency = Math.max(1, Math.floor(this.partConcurrency / 2)); }
  faster() { if (++this.good >= 8) { this.good = 0; this.partConcurrency = Math.min(this.maxParts, this.partConcurrency + 1); } }
  get(id) { return this.items.find((i) => i.id === id); }

  async session(it) {   // a saved session to resume, or a new one (start on tower → init at the edge)
    const saved = this.store.get(it.fp);
    if (saved?.uploadId && saved.size === it.size) return saved;
    const r = await this.fetchImpl(`${this.base}/api/dewey/upload/start`, { method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', ...this.authHeaders() }, body: JSON.stringify({ name: it.name, size: it.size }) });
    const s = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(s.error || s.message || `Dewey refused the upload (${r.status})`), { fatal: true });
    const i = await this.fetchImpl(`${this.base}/api/dewey/upload/init`, { method: 'POST', headers: { 'x-upload-token': s.token } });
    const init = await i.json().catch(() => ({}));
    if (!i.ok) throw new Error(init.error || `could not open the upload (${i.status})`);
    const sess = { token: s.token, key: s.key, uploadId: init.uploadId, partSize: init.partSize || partSizeFor(it.size), parts: Math.max(1, Math.ceil(it.size / (init.partSize || partSizeFor(it.size)))), size: it.size, etags: {} };
    this.store.set(it.fp, sess); return sess;
  }

  async run(it) {
    it.state = 'uploading'; it.error = null; it.ctl = new AbortController(); this.emit();
    try {
      let sess = await this.session(it);
      for (let attempt = 0; ; attempt++) {
        const out = await this.sendParts(it, sess);
        if (out === 'restart' && attempt < 2) { this.store.del(it.fp); sess = await this.session(it); continue; }   // token/upload expired → fresh session
        if (out === 'restart') throw new Error('the upload expired and could not be restarted');
        break;
      }
      const res = await this.fetchImpl(`${this.base}/api/dewey/upload/complete?uploadId=${encodeURIComponent(sess.uploadId)}`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-upload-token': sess.token }, body: JSON.stringify({ parts: Object.entries(sess.etags).map(([n, etag]) => ({ n: Number(n), etag })) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { if (res.status === 422 || res.status === 415) { this.store.del(it.fp); throw Object.assign(new Error(body.error), { fatal: true }); } throw new Error(body.error || `could not finish (${res.status})`); }
      this.store.del(it.fp); it.state = 'done'; it.sent = it.size; it.item = body.item;
    } catch (e) {
      if (it.state === 'paused' || it.state === 'canceled') { /* user action */ }
      else { it.state = 'error'; it.error = e.message || String(e); }
    }
    this.emit(); this.pump();
  }

  /** Upload every part not yet confirmed. 'ok' | 'restart'. Throws when a part keeps failing. */
  async sendParts(it, sess) {
    const n = sess.parts, size = sess.partSize, todo = [];
    it.partBytes = {};
    for (let p = 1; p <= n; p++) { if (sess.etags[p]) it.partBytes[p] = Math.min(size, it.size - (p - 1) * size); else todo.push(p); }
    const recount = () => { it.sent = Object.values(it.partBytes).reduce((a, b) => a + b, 0); this.emit(); };
    recount();
    let restart = false;
    const worker = async () => {
      while (todo.length && !restart && it.state === 'uploading') {
        const p = todo.shift(), blob = it.file.slice((p - 1) * size, Math.min(p * size, it.size));
        for (let t = 0; ; t++) {
          if (it.state !== 'uploading') return;
          while (this.inflight >= this.partConcurrency) { await new Promise((r) => setTimeout(r, 20)); if (it.state !== 'uploading') return; }   // one budget of parts in flight across all files
          this.inflight++;
          try {
            const r = await this.putPart(`${this.base}/api/dewey/upload/part?uploadId=${encodeURIComponent(sess.uploadId)}&n=${p}`, blob, { 'x-upload-token': sess.token },
              (loaded) => { it.partBytes[p] = loaded; recount(); }, it.ctl.signal);
            if (r.status === 401 || r.status === 404) { restart = true; return; }
            if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) throw Object.assign(new Error(r.body?.error || `part ${p} refused (${r.status})`), { fatal: true });
            if (r.status >= 400) throw new Error(`part ${p} failed (${r.status})`);
            sess.etags[p] = r.body.etag; this.store.set(it.fp, sess); it.partBytes[p] = blob.size; recount(); this.faster(); break;
          } catch (e) {
            if (e.aborted || e.fatal || t >= this.retries) throw e;
            this.slower(); it.partBytes[p] = 0; recount(); await this.sleep(Math.min(30000, 1000 * 2 ** t));   // dropped connection: back off, then the same part again
          } finally { this.inflight--; }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.maxParts, todo.length) }, worker));
    if (it.state !== 'uploading') throw Object.assign(new Error('stopped'), { aborted: true });
    return restart ? 'restart' : 'ok';
  }
}
