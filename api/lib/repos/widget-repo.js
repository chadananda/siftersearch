// widget-repo — the SifterChat widget's site profiles (widget_profiles): the domains allowed to embed it (the shared HTTP
// server's CORS check, api/lib/http-server.js). Deps: db.
import { queryAll } from '../db.js';

/** Every domain any widget profile allows (profiles store a JSON array of bare hosts). */
export async function widgetProfileDomains() {
  const rows = await queryAll('SELECT domains FROM widget_profiles', [], 'widget-repo:domains');
  const out = [];
  for (const r of rows) { try { out.push(...JSON.parse(r.domains || '[]')); } catch { /* skip malformed */ } }
  return out;
}
