// Implication browser API client (contract: brief-implied-browser.md). `?fixture=1` swaps in fixture.js (no network). Deps: lib/api authenticatedFetch
import { authenticatedFetch } from '../../../lib/api.js';
import { fixtureApi } from './fixture.js';
const API = import.meta.env.PUBLIC_API_URL || '';
export const isFixture = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('fixture');
const qs = (p = {}) => { const u = new URLSearchParams(); Object.entries(p).forEach(([k, v]) => v !== '' && v != null && u.set(k, v)); const s = u.toString(); return s ? '?' + s : ''; };
async function call(method, path, params, body) {
  if (isFixture()) { await new Promise((r) => setTimeout(r, 120)); return structuredClone(fixtureApi(method, path, params, body)); }
  const res = await authenticatedFetch(`${API}/api/admin${path}${qs(params)}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.reason || data.error || data.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return data;
}
export const api = {
  overview: () => call('GET', '/implied/overview'),
  list: (p) => call('GET', '/implied', p),
  search: (p) => call('GET', '/implied/search', p),
  get: (id) => call('GET', `/implied/${id}`),
  similar: (id, limit = 20) => call('GET', `/implied/${id}/similar`, { limit }),
  create: (b) => call('POST', '/implied', null, b),
  patch: (id, b) => call('PATCH', `/implied/${id}`, null, b),
  remove: (id, hard) => call('DELETE', `/implied/${id}`, hard ? { hard: 1 } : null),
  bulk: (ids, status) => call('POST', '/implied/bulk', null, { ids, status }),
  graph: (p) => call('GET', '/implied/graph', p),
  para: (id) => call('GET', `/hype/paragraph/${id}`),
  savePara: (id, b) => call('PUT', `/hype/paragraph/${id}`, null, b),
  propose: (id) => call('POST', `/hype/paragraph/${id}/propose`),
  edits: (limit = 50) => call('GET', '/implied/edits', { limit }),
  setScore: (b) => call('PUT', '/implied/score', null, b),
  clearScore: (paraId, question) => call('DELETE', '/implied/score', { paraId, question }),
  scores: (p) => call('GET', '/implied/scores', p),
  scoreStats: () => call('GET', '/implied/scores/stats'),
  sample: (p) => call('GET', '/implied/sample', p),
};
