// Anís tool catalog admin (ops service, requireInternal / X-Internal-Key). CLI: scripts/ops/ops.mjs anis-tools | anis-tool-register <file.json>
// | anis-tool-status <name> <built|disabled> | anis-tool-credential <name> (secret on stdin) | anis-tool-test <name> ['<json input>'].
//   GET    /ops/tools                            → { rev, source, key_set, tools[], credentials[] } — never a secret
//   POST   /ops/tools {name,label,purpose,input?,output?,example?,timeoutMs?,http:{method,url,body?,headers?,auth,credential?,pick?,cost_usd?}}
//                                                → the stored HTTP tool row (live in every process within seconds, no restart)
//   POST   /ops/tools/:name/status {status}      → { name, was, status } (built | disabled; planned for plan rows)
//   PUT    /ops/tools/credentials/:name {secret} → { name, updated_at } (set / rotate; 503 when TOOL_SECRETS_KEY is unset)
//   DELETE /ops/tools/credentials/:name          → { name, deleted }
//   POST   /ops/tools/:name/test {input}         → { name, ok, ms, output | error } (one real call of an HTTP tool, disabled or not)
// Code tools are tested on their own route (POST /api/v1/tools/{name}) and their metadata is synced by the Anís service at boot
// (api/anis-index.js): this service stays off tools.js's import graph, so it neither reloads with it nor runs stale tool code.
// Deps: repos/anis-tools-repo, assistant/http-tool, tool-error.
import { requireInternal } from '../lib/auth.js';
import * as repo from '../lib/repos/anis-tools-repo.js';
import { runHttpTool } from '../lib/assistant/http-tool.js';
import { errorBody, toToolError } from '../lib/assistant/tool-error.js';

const notFound = (name) => Object.assign(new Error(`unknown tool: ${name}`), { statusCode: 404 });
const BODY_SECRET = { type: 'object', required: ['secret'], additionalProperties: false, properties: { secret: { type: 'string', minLength: 1, maxLength: 8192 } } };

export default async function anisToolsAdminRoutes(fastify, { deps = {} } = {}) {
  const R = deps.repo || repo;
  const db = () => (deps.db ||= R.toolsDb());
  const after = (x) => { R.invalidateCatalog?.(); return x; };

  fastify.get('/ops/tools', { preHandler: requireInternal }, async () => {
    const c = R.catalog();
    return { rev: c.rev, source: c.source, key_set: !!R.secretsKey(), tools: R.listTools(db()), credentials: R.credentialList(db()) };
  });
  fastify.post('/ops/tools', { preHandler: requireInternal }, async (req) => after(R.registerHttpTool(db(), req.body || {})));
  fastify.post('/ops/tools/:name/status', { preHandler: requireInternal }, async (req) => {
    const r = R.setToolStatus(db(), req.params.name, String(req.body?.status || ''));
    if (!r) throw notFound(req.params.name);
    return after(r);
  });
  // the secret travels in the body only; it is never echoed, logged or stored in clear
  fastify.put('/ops/tools/credentials/:name', { preHandler: requireInternal, schema: { body: BODY_SECRET } },
    async (req) => after(R.setCredential(db(), req.params.name, req.body.secret)));
  fastify.delete('/ops/tools/credentials/:name', { preHandler: requireInternal }, async (req) => after({ name: req.params.name, deleted: R.deleteCredential(db(), req.params.name) }));
  fastify.post('/ops/tools/:name/test', { preHandler: requireInternal }, async (req, reply) => {
    const name = req.params.name, row = R.getTool(db(), name);
    if (!row) throw notFound(name);
    if (row.executor !== 'http') throw Object.assign(new Error(`${name} is a ${row.executor === 'code' ? 'code tool: call POST /api/v1/tools/' + name : 'planned tool (not callable)'}`), { statusCode: 400 });
    const t0 = performance.now();
    try {
      return { name, ok: true, ms: Math.round(performance.now() - t0), output: await runHttpTool(row, req.body?.input ?? {}, deps.ctx || {}) };
    } catch (err) {
      return reply.code(200).send({ name, ok: false, ms: Math.round(performance.now() - t0), ...errorBody(toToolError(err)) });
    }
  });
}
