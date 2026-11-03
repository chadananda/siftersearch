// The Anís tools as an API: POST /api/v1/tools/<name> for every public registry tool (api/lib/assistant/tools.js) — the same
// run(name, input) contract strategies and the researcher use. Input/output JSON Schemas validate + serialize; errors are
// {error:{code,message}}. Old names are hidden alias routes. Auth = the public API key (public-api.js apiKeyAuth).
import { REGISTRY, ALIASES, publicNames, list, run, ERROR } from '../lib/assistant/tools.js';
import { apiKeyAuth } from './public-api.js';

/** A registry schema made safe to compile many times in one spec: shared schemas' $id → title (inlined). Pure. */
export function apiSchema(s) {
  if (Array.isArray(s)) return s.map(apiSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) if (k === '$id') out.title ??= v; else out[k] = apiSchema(v);
  return out;
}

const fail = (reply, status, code, message) => reply.code(status).send({ error: { code, message: String(message || code).slice(0, 500) } });
const ERR = apiSchema(ERROR);

export default async function anisToolRoutes(fastify) {
  fastify.addHook('preHandler', apiKeyAuth);
  fastify.setErrorHandler((err, req, reply) => {
    if (reply.sent) return;
    if (err.validation) return fail(reply, 400, 'invalid_input', err.message);
    req.log?.warn?.({ err }, 'anis tool route failed');
    return fail(reply, err.statusCode && err.statusCode < 500 ? err.statusCode : 500, 'tool_failed', err.message);
  });

  fastify.get('/tools', {
    schema: { summary: 'List the Anís tools', description: 'Every callable tool and strategy by canonical name, with its label and purpose. Call one with POST /api/v1/tools/{name}.',
      tags: ['Anís Tools'], security: [{ apiKey: [] }],
      response: { 200: { type: 'object', required: ['tools'], properties: { tools: { type: 'array', items: { type: 'object', required: ['name', 'label', 'purpose'],
        properties: { name: { type: 'string' }, label: { type: 'string' }, kind: { type: 'string', enum: ['tool', 'strategy'] }, purpose: { type: 'string' } } } } } } } },
  }, async () => ({ tools: list() }));

  const route = (path, e, hide) => fastify.post(`/tools/${path}`, {
    schema: { ...(hide ? { hide: true } : {}), summary: e.label, tags: ['Anís Tools'], security: [{ apiKey: [] }],
      description: `${e.purpose}\n\n${e.kind === 'strategy' ? 'Strategy' : 'Tool'} \`${e.name}\` → ${e.outputName}. Example input: \`${JSON.stringify(e.example?.input ?? {})}\``,
      body: apiSchema(e.input), response: { 200: apiSchema(e.output), 400: ERR, 404: ERR, 500: ERR } },
  }, async (req, reply) => {
    try { return await run(e.name, req.body || {}); } catch (err) {
      return err.code === 'unknown_tool' ? fail(reply, 404, 'unknown_tool', err.message) : fail(reply, 500, 'tool_failed', err.message);
    }
  });
  for (const name of publicNames()) route(name, REGISTRY[name], false);
  for (const [alias, name] of Object.entries(ALIASES)) if (publicNames().includes(name)) route(alias, REGISTRY[name], true);
}
