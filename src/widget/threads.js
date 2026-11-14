// Anís conversation threads (pure + a thin localStorage layer). Index `anis-threads:<token>` = [{id,title,updated,pinned?}],
// each thread's transcript at `anis-thread:<token>:<id>` (last 40). The old single transcript `sifter-chat:<token>` migrates into thread #1.
// Storage is injected (anything with getItem/setItem/removeItem) so every function runs in tests without a browser.

export const MAX_THREADS = 200;
export const KEEP_MESSAGES = 40;
export const idxKey = (token) => `anis-threads:${token}`;
export const threadKey = (token, id) => `anis-thread:${token}:${id}`;
export const activeKey = (token) => `anis-thread-active:${token}`;
export const legacyKey = (token) => `sifter-chat:${token}`;

export function newThreadId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** A thread's title: the first question, one line, ≤ max chars, cut at a word boundary with an ellipsis. */
export function threadTitle(text, max = 60) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return 'New conversation';
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

export const firstQuestion = (messages) => (messages || []).find((m) => m?.role === 'user')?.content || '';

/** Newest first. */
export const sortThreads = (index) => [...index].sort((a, b) => (b.updated || 0) - (a.updated || 0));

/** Insert or update one entry (fields merged), newest first. */
export function upsertThread(index, entry) {
  const rest = (index || []).filter((t) => t.id !== entry.id);
  const prev = (index || []).find((t) => t.id === entry.id);
  return sortThreads([...rest, { ...prev, ...entry }]);
}

export const removeThread = (index, id) => (index || []).filter((t) => t.id !== id);

/** A published share recorded on its thread ({slug, url, key}: the key unpublishes); one record per slug. */
export const addShare = (index, id, share) => (index || []).map((t) => (t.id !== id ? t : { ...t, shares: [...(t.shares || []).filter((x) => x.slug !== share.slug), share] }));
/** The thread's shares forgotten (after unpublishing them). */
export const dropShares = (index, id) => (index || []).map((t) => { if (t.id !== id) return t; const { shares, ...rest } = t; return rest; });

/** Keep at most `max` threads: the oldest unpinned go first. Returns the kept index and the ids dropped. */
export function pruneThreads(index, max = MAX_THREADS) {
  const sorted = sortThreads(index || []);
  if (sorted.length <= max) return { index: sorted, dropped: [] };
  const dropped = [];
  for (let i = sorted.length - 1; i >= 0 && sorted.length - dropped.length > max; i--) if (!sorted[i].pinned) dropped.push(sorted[i].id);
  return { index: sorted.filter((t) => !dropped.includes(t.id)), dropped };
}

const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Pinned / Today / Yesterday / Previous 7 days / Older (local calendar days); empty groups left out. */
export function groupThreads(index, now = Date.now()) {
  const today = dayStart(now), yesterday = dayStart(today - 1), week = today - 7 * 864e5;
  const groups = [['Pinned', []], ['Today', []], ['Yesterday', []], ['Previous 7 days', []], ['Older', []]];
  for (const t of sortThreads(index || [])) {
    const u = t.updated || 0;
    const g = t.pinned ? 0 : u >= today ? 1 : u >= yesterday ? 2 : u >= week ? 3 : 4;
    groups[g][1].push(t);
  }
  return groups.filter(([, items]) => items.length).map(([label, items]) => ({ label, items }));
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Client-side search: every word must appear in the title or the thread's text (case- and accent-insensitive). */
export function filterThreads(index, query, textOf = () => '') {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return index || [];
  return (index || []).filter((t) => {
    const hay = `${fold(t.title)}\n${fold(textOf(t.id))}`;
    return words.every((w) => hay.includes(w));
  });
}

/** The plain text of a transcript, for search. */
export const messagesText = (messages) => (messages || []).map((m) => m?.content || '').join('\n');

// ── storage layer ─────────────────────────────────────────────────────────────────────────────────────────────
const readJSON = (storage, key, dflt) => { try { const v = JSON.parse(storage.getItem(key) || 'null'); return v ?? dflt; } catch { return dflt; } };
const write = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const loadIndex = (storage, token) => { const v = readJSON(storage, idxKey(token), []); return Array.isArray(v) ? sortThreads(v.filter((t) => t?.id)) : []; };
export const saveIndex = (storage, token, index) => write(storage, idxKey(token), index);
export const loadMessages = (storage, token, id) => { const v = id ? readJSON(storage, threadKey(token, id), []) : []; return Array.isArray(v) ? v : []; };
/** Settled messages only (a reply still streaming is never stored), last KEEP_MESSAGES. */
export const saveMessages = (storage, token, id, messages) =>
  write(storage, threadKey(token, id), (messages || []).filter((m) => !m?.pending).slice(-KEEP_MESSAGES));
export function dropThreadData(storage, token, id) { try { storage.removeItem(threadKey(token, id)); } catch { /* private mode */ } }

/**
 * Open the store: the index plus the thread to show. The first run with the new store moves the old single
 * transcript (`sifter-chat:<token>`) into thread #1 — only when it holds a question — and removes the old key.
 * The remembered active thread may be a fresh, never-asked one (not in the index yet); it is kept.
 */
export function openStore(storage, token, now = Date.now()) {
  let index = loadIndex(storage, token);
  if (!index.length) {
    const legacy = readJSON(storage, legacyKey(token), []);
    if (Array.isArray(legacy) && legacy.some((m) => m?.role === 'user')) {
      const id = newThreadId();
      saveMessages(storage, token, id, legacy);
      index = [{ id, title: threadTitle(firstQuestion(legacy)), updated: now }];
      saveIndex(storage, token, index);
      try { storage.setItem(activeKey(token), id); } catch { /* ok */ }
    }
    try { storage.removeItem(legacyKey(token)); } catch { /* ok */ }
  }
  let active = '';
  try { active = storage.getItem(activeKey(token)) || ''; } catch { /* ok */ }
  if (!active) active = index[0]?.id || newThreadId();
  return { index, active };
}

// ── Introduce once (Chad 11-14: "the introduction is only for the first time"). A reader who has asked anything on this
// device — the seen flag, or any listed thread (readers from before the flag) — gets no introduction again: a quiet empty
// state, and no `first_visit` on their turns. Storage that throws (private mode) reads as a first visit.
export const seenKey = (token) => `sifter-chat-seen:${token}`;
export function isFirstVisit(storage, token) {
  try { if (storage.getItem(seenKey(token))) return false; } catch { return true; }
  return !loadIndex(storage, token).length;
}
export function markSeen(storage, token) { try { storage.setItem(seenKey(token), '1'); } catch { /* private mode */ } }
