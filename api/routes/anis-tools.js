// The Anís tools as an API: POST /api/v1/tools/<name> for every contract tool (api/lib/assistant/tools.js REGISTRY) — the same
// run(name, input) contract strategies and the researcher use. Input/output JSON Schemas validate + serialize; every error is
// {error:{code,message,retryable}} (tool-error.js): 400 invalid_input/empty_input, 404 unknown_tool, 503 unavailable, 504 timeout. Auth = public API key.
import { REGISTRY, publicNames, list, run, ERROR } from '../lib/assistant/tools.js';
import { plainSchema as apiSchema } from '../lib/assistant/tool-kit.js';
import { STATUS, errorBody, toToolError } from '../lib/assistant/tool-error.js';
import { apiKeyAuth } from './public-api.js';

export { apiSchema };
const ERR = apiSchema(ERROR);
const fail = (reply, err) => { const e = toToolError(err); return reply.code(STATUS[e.code] || 500).send(errorBody(e)); };

export default async function anisToolRoutes(fastify) {
  fastify.addHook('preHandler', apiKeyAuth);
  fastify.setErrorHandler((err, req, reply) => {
    if (reply.sent) return;
    if (err.validation) return fail(reply, Object.assign(new Error(err.message), { code: 'invalid_input', retryable: false }));
    req.log?.warn?.({ err }, 'anis tool route failed');
    return err.statusCode && err.statusCode < 500 ? reply.code(err.statusCode).send(errorBody(Object.assign(new Error(err.message), { code: 'invalid_input' }))) : fail(reply, err);
  });

  fastify.get('/tools', {
    schema: { summary: 'List the Anís tools', description: 'Every contract tool by canonical name, with its label, purpose and declared cost. Call one with POST /api/v1/tools/{name}; GET /api/v1/tools/{name} is not needed — each tool’s input/output schema is in this API’s OpenAPI document.',
      tags: ['Anís Tools'], security: [{ apiKey: [] }],
      response: { 200: { type: 'object', required: ['tools'], properties: { tools: { type: 'array', items: { type: 'object', required: ['name', 'label', 'purpose', 'cost', 'input', 'output'],
        properties: { name: { type: 'string' }, label: { type: 'string' }, kind: { type: 'string' }, purpose: { type: 'string' },
          cost: { type: 'object', properties: { llm: { type: 'boolean' }, embed: { type: 'boolean' }, p50_ms: { type: 'number' } } },
          input: { type: 'object', additionalProperties: true }, output: { type: 'object', additionalProperties: true } } } } } } } },
  }, async () => ({ tools: list().map((t) => ({ ...t, input: apiSchema(REGISTRY[t.name].input), output: apiSchema(REGISTRY[t.name].output) })) }));

  for (const name of publicNames()) {
    const e = REGISTRY[name];
    fastify.post(`/tools/${name}`, {
      schema: { summary: e.label, tags: ['Anís Tools'], security: [{ apiKey: [] }],
        description: `${e.purpose}\n\nTool \`${e.name}\` → ${e.outputName}. Cost: ${JSON.stringify(e.cost)}. Example input: \`${JSON.stringify(e.example?.input ?? {})}\``,
        body: apiSchema(e.input), response: { 200: apiSchema(e.output), 400: ERR, 404: ERR, 500: ERR, 503: ERR, 504: ERR } },
    }, async (req, reply) => { try { return await run(e.name, req.body || {}); } catch (err) { return fail(reply, err); } });
  }
}
