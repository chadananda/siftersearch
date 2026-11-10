// The generic executor for HTTP tools — tools defined entirely by a row in the catalog (repos/anis-tools-repo.js), registered at
// runtime through the ops API. url/body templates take {field} from the input; auth builds the header from a stored credential
// (decrypted only here, never logged or returned); pick maps the JSON reply to the output. Errors are ToolErrors: unavailable
// (no key / no credential), timeout, tool_failed (non-2xx, bad JSON). Deps: tool-error, anis-tools-repo (secretFor).
import { ToolError } from './tool-error.js';
import { secretFor as storedSecret, secretsKey } from '../repos/anis-tools-repo.js';

const field = (input, k) => (input?.[k] == null ? '' : typeof input[k] === 'object' ? JSON.stringify(input[k]) : String(input[k]));
/** "https://x/{q}?n={limit}" + input → the URL, every value URI-encoded. Pure. */
export const fillUrl = (tpl, input) => String(tpl).replace(/\{([A-Za-z0-9_]+)\}/g, (_, k) => encodeURIComponent(field(input, k)));
/** A body template: a string that is exactly "{field}" takes the input value as is (typed); other strings interpolate; objects
 *  and arrays recurse. No template → the input itself. Pure. */
export function fillBody(tpl, input) {
  if (tpl == null) return input;
  if (typeof tpl === 'string') { const m = tpl.match(/^\{([A-Za-z0-9_]+)\}$/); return m ? input?.[m[1]] ?? null : tpl.replace(/\{([A-Za-z0-9_]+)\}/g, (_, k) => field(input, k)); }
  if (Array.isArray(tpl)) return tpl.map((x) => fillBody(x, input));
  if (typeof tpl === 'object') return Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, fillBody(v, input)]));
  return tpl;
}
/** A small JSON path: "data.items[0].text", "$.results", "" / "$" = the whole reply. Missing → undefined. Pure. */
export function pickPath(obj, path) {
  const steps = String(path || '').replace(/^\$\.?/, '').match(/[^.[\]]+|\[\d+\]/g) || [];
  let v = obj;
  for (const s of steps) { if (v == null) return undefined; v = s.startsWith('[') ? v[Number(s.slice(1, -1))] : v[s]; }
  return v;
}
/** pick = a path (the value; a non-object is wrapped as { result }) or { outputField: path }. No pick → the whole reply. Pure. */
export function mapOutput(body, pick) {
  if (pick == null) return body && typeof body === 'object' && !Array.isArray(body) ? body : { result: body };
  if (typeof pick === 'string') { const v = pickPath(body, pick); return v && typeof v === 'object' && !Array.isArray(v) ? v : { result: v ?? null }; }
  return Object.fromEntries(Object.entries(pick).map(([k, p]) => [k, pickPath(body, p) ?? null]));
}
/** auth + secret → headers. Pure. */
export function authHeaders(auth, secret) {
  if (!auth || auth === 'none') return {};
  if (auth === 'bearer') return { Authorization: `Bearer ${secret}` };
  if (auth === 'basic') return { Authorization: `Basic ${Buffer.from(secret).toString('base64')}` };   // secret = "user:password"
  if (auth.startsWith('header:')) return { [auth.slice(7)]: secret };
  return {};
}

/** Run one HTTP tool row on an input. ctx.deps: fetch, secretFor(name), secretsKey (tests). */
export async function runHttpTool(row, input = {}, ctx = {}) {
  const h = row?.http || {};
  const d = ctx.deps || {};
  const auth = h.auth || 'none';
  let headers = { Accept: 'application/json', ...(h.headers || {}) };
  if (auth !== 'none') {
    const hasKey = d.secretsKey !== undefined ? !!d.secretsKey : !!secretsKey();
    if (!hasKey) throw new ToolError('unavailable', `${row.name}: the credential store is locked (TOOL_SECRETS_KEY is not set)`, false);
    const secret = await (d.secretFor || storedSecret)(h.credential);
    if (!secret) throw new ToolError('unavailable', `${row.name}: credential "${h.credential}" is not set`, false);
    headers = { ...headers, ...authHeaders(auth, secret) };
  }
  const method = h.method || 'GET';
  const body = method === 'GET' ? undefined : JSON.stringify(fillBody(h.body, input));
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ms = row.timeoutMs || 10_000, ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const fail = (err) => {
    if (err instanceof ToolError) return err;
    if (ac.signal.aborted || err?.name === 'AbortError') return new ToolError('timeout', `${row.name}: no answer in ${ms} ms`, true);
    return new ToolError('unavailable', `${row.name}: request failed (${err?.code || err?.name || 'network'})`, true);
  };
  let json;
  try {   // the timer covers the reply body too
    const res = await (d.fetch || fetch)(fillUrl(h.url, input), { method, headers, body, signal: ac.signal });
    if (!res.ok) throw new ToolError(res.status === 429 || res.status >= 500 ? 'unavailable' : 'tool_failed', `${row.name}: HTTP ${res.status}`, res.status === 429 || res.status >= 500);
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { throw new ToolError('tool_failed', `${row.name}: the reply is not JSON`, false); }
  } catch (err) { throw fail(err); } finally { clearTimeout(timer); }
  return mapOutput(json, h.pick);
}
