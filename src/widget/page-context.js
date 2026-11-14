// The widget on an Anís content page (Chad 11-14): the page it sits on (window.anisPage, set by worker/anis/content-widget.js),
// the "Ask about this …" first suggestion, the way back to full mode (/?t=<thread>) and the remembered open/closed state. Pure
// except the storage helpers, which take the storage (try/catch: private mode).

export const ANIS_HOST = 'anis.oceanlibrary.com';
export const KINDS = ['discussion', 'text', 'person', 'talk'];
const THREAD_ID = /^[A-Za-z0-9-]{6,64}$/;

/** window.anisPage → {type, slug, title} or null (anything malformed is ignored, never thrown). */
export function pageContext(raw) {
  if (!raw || typeof raw !== 'object' || !KINDS.includes(raw.type)) return null;
  const title = String(raw.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!title) return null;
  return { type: raw.type, slug: String(raw.slug || '').slice(0, 160), title };
}

export const askLabel = (ctx) => `Ask about this ${ctx.type}`;

/** The question the "Ask about this …" suggestion sends: it names the page, so the answer needs no hidden context. */
export function askQuestion(ctx) {
  const t = ctx.title;
  if (ctx.type === 'person') return `Who was ${t}, and what should I read about them?`;
  if (ctx.type === 'talk') return `What is the talk "${t}" about?`;
  if (ctx.type === 'discussion') return `Tell me more about the question in the discussion "${t}".`;
  return `Tell me about "${t}": what it is and what it teaches.`;
}

/** The full app with this thread open. On the Anís host (or a local preview) the threads are shared, so the thread goes along;
 * an embed on another site cannot hand its threads over, so it opens the app itself. */
export function fullModeHref(host, threadId) {
  const own = host === ANIS_HOST || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(host || ''));
  const t = THREAD_ID.test(String(threadId || '')) ? `?t=${encodeURIComponent(threadId)}` : '';
  return own ? `/${t}` : `https://${ANIS_HOST}/`;
}

/** The app's ?t=<thread> → the thread id, or '' when absent or malformed. */
export function threadParam(search) {
  try { const t = new URLSearchParams(search || '').get('t') || ''; return THREAD_ID.test(t) ? t : ''; } catch { return ''; }
}

/** The app's ?ask=<question> (a content page's "Ask Anís about …" link opened in a new tab) → the question, or ''. */
export function askParam(search) {
  try { return (new URLSearchParams(search || '').get('ask') || '').replace(/\s+/g, ' ').trim().slice(0, 500); } catch { return ''; }
}

// remembered open/closed, per reader (content pages only: an embed elsewhere keeps its host's choice)
export const openKey = (token) => `anis-widget-open:${token}`;
export function loadOpen(storage, token) { try { return storage.getItem(openKey(token)) === '1'; } catch { return false; } }
export function saveOpen(storage, token, open) { try { storage.setItem(openKey(token), open ? '1' : '0'); } catch { /* private mode */ } }
/** Open on load only when the reader left it open, on a wide screen (on a phone the sheet would cover the page they came to read). */
export const startOpen = ({ remembered, wide }) => !!remembered && !!wide;
