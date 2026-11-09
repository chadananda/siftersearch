// The ONE tool error: { error: { code, message, retryable } }. Tools throw ToolError; run() normalises anything else; the route maps code → HTTP status.
// A timeout or a failed layer is an error — never an empty result (an empty list means "searched, nothing there").
export class ToolError extends Error {
  constructor(code, message, retryable = false) { super(message || code); this.name = 'ToolError'; this.code = code; this.retryable = retryable; }
}
export const STATUS = { invalid_input: 400, empty_input: 400, unknown_tool: 404, timeout: 504, rights_unavailable: 503, unavailable: 503, tool_failed: 500 };
/** Any thrown value → a ToolError (same object when it already is one; a coded error keeps its code). */
export function toToolError(err) {
  if (err instanceof ToolError) return err;
  const e = err instanceof Error ? err : new Error(String(err));
  e.code = typeof e.code === 'string' ? e.code : 'tool_failed';
  e.retryable = e.retryable ?? ['timeout', 'unavailable'].includes(e.code);
  return e;
}
/** → { error: { code, message, retryable } } for any thrown value. */
export const errorBody = (err) => { const e = toToolError(err); return { error: { code: e.code, message: String(e.message || e.code).slice(0, 500), retryable: !!e.retryable } }; };
