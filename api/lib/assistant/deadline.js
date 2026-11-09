// Deadline for slow library calls on the Anís path (search under load). withDeadline THROWS a ToolError: past `ms` code 'timeout'
// (retryable), a failure of fn passes through — an error is never turned into "nothing found". withDeadlines is the CONSUMER-side
// degrade (the respond@3 researcher chooses to carry on without a tool): it logs, and only it substitutes a fallback. Deps: logger
import { logger } from '../logger.js';
import { ToolError, toToolError } from './tool-error.js';

export const TOOL_DEADLINE_MS = () => Number(process.env.ANIS_TOOL_DEADLINE_MS) || 15000;

/** → fn's result; throws ToolError('timeout') past ms, or fn's own error. The late result is dropped. */
export async function withDeadline(fn, ms, label = 'tool') {
  let timer;
  const slow = new Promise((res) => { timer = setTimeout(() => res({ slow: true }), ms); });
  try {
    const r = await Promise.race([Promise.resolve().then(fn).then((v) => ({ v }), (e) => ({ e })), slow]);
    if (r.slow) { logger.warn({ label, ms }, 'anis: slow library call — timeout'); throw new ToolError('timeout', `${label} took longer than ${ms} ms`, true); }
    if (r.e) throw toToolError(r.e);
    return r.v;
  } finally { clearTimeout(timer); }
}

/** Consumer-side degrade: each named async tool yields its fallback ([] for lists, null for one result) when it errors — logged. */
export function withDeadlines(tools, spec, ms = TOOL_DEADLINE_MS()) {
  const out = { ...tools };
  for (const [name, fallback] of Object.entries(spec)) {
    const f = tools[name];
    if (typeof f === 'function') out[name] = (...a) => withDeadline(() => f(...a), ms, name).catch((err) => { logger.warn({ label: name, err: err?.message, code: err?.code }, 'anis: library call failed — consumer carries on without it'); return Array.isArray(fallback) ? [] : fallback; });
  }
  return out;
}
