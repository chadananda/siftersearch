// Who can apply an improvement (Chad 11-04): DATA targets (strategy, step, template) the live loop may apply itself; CODE
// targets (activity, tool, index, writer-code, other-code) Claude Code applies, read daily from /api/admin/anis/improve-digest.
// The analyst names the target; inferTarget() covers rows from before it did (and an unnamed or invalid one). Pure.
export const DATA_TARGETS = ['strategy', 'step', 'template'];
export const CODE_TARGETS = ['activity', 'tool', 'index', 'writer-code', 'other-code'];
export const TARGETS = [...DATA_TARGETS, ...CODE_TARGETS];
export const targetClass = (t) => (DATA_TARGETS.includes(t) ? 'data' : 'code');

/** { stage, file } → a target. Activities/tools/search+index code are code; route recipes in strategies are strategy data. */
export function inferTarget({ stage = null, file = null } = {}) {
  const f = String(file || '').toLowerCase(), s = String(stage || '').toUpperCase();
  if (/assistant\/activit/.test(f)) return 'activity';
  if (/assistant\/tools(\.js|\/)/.test(f)) return 'tool';
  if (/(^|\/)search\/|search\.js|index|qdrant|phrase|embedding|bm25/.test(f)) return 'index';
  if (/strateg/.test(f) || (s === 'STRATEGY' && !f)) return 'strategy';
  if (/template/.test(f)) return 'template';
  if (s === 'WRITER' || /assistant\/(prompt|quotes|lint|md-valid|respond|formats|craft)\.js/.test(f)) return 'writer-code';
  if (!f && (s === 'RETRIEVAL' || s === 'RANK')) return 'index';
  return 'other-code';
}
export const targetOf = (row = {}) => (TARGETS.includes(row.target) ? row.target : inferTarget(row));
