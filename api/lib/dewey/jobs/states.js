// Dewey job state machine. received → fetching → inspecting → deduping → processing → awaiting-decision → published | failed.
// Extra terminals: skipped (duplicate / off-scope / refused), cancelled, handed-off (passed to a pipeline that publishes on its own, e.g. media).
export const TERMINAL = ['published', 'failed', 'cancelled', 'skipped', 'handed-off'];
const NEXT = {
  received: ['fetching', 'inspecting', 'deduping', 'processing', 'awaiting-decision', 'published', 'handed-off', 'failed', 'cancelled', 'skipped'],
  fetching: ['received', 'inspecting', 'processing', 'failed', 'cancelled'],
  inspecting: ['deduping', 'processing', 'awaiting-decision', 'skipped', 'failed', 'cancelled'],
  deduping: ['processing', 'awaiting-decision', 'published', 'skipped', 'failed', 'cancelled'],
  processing: ['deduping', 'awaiting-decision', 'published', 'handed-off', 'skipped', 'failed', 'cancelled'],
  'awaiting-decision': ['processing', 'published', 'handed-off', 'skipped', 'cancelled', 'failed'],
};
export const isTerminal = (s) => TERMINAL.includes(s);
export const canMove = (from, to) => from === to || !!NEXT[from]?.includes(to);
export const assertMove = (from, to) => { if (!canMove(from, to)) throw Object.assign(new Error(`illegal Dewey job move ${from} → ${to}`), { code: 'ILLEGAL_MOVE' }); };
export const STATES = ['received', 'fetching', 'inspecting', 'deduping', 'processing', 'awaiting-decision', ...TERMINAL];
