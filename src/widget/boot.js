// Anís first paint without waiting on the network (P6, Lighthouse NO_FCP): the widget renders at once from the last config
// it saw (localStorage `anis-cfg:<token>`), or — full screen, first visit — from defaults; the live config fetch then refreshes it.
// Storage is injected (getItem/setItem) so every function runs in tests.

export const cfgKey = (token) => `anis-cfg:${token}`;
// only what the first render needs; greetings etc. arrive with the live fetch
const KEEP = ['name', 'accent', 'placeholder', 'position', 'chatbotLocation', 'greeting', 'greetings'];

/** The fields worth caching from a live config (no unknown keys, nothing huge). */
export function slimConfig(c) {
  const out = {};
  for (const k of KEEP) if (c?.[k] !== undefined) out[k] = c[k];
  return out;
}

export function loadConfig(storage, token) {
  try {
    const c = JSON.parse(storage.getItem(cfgKey(token)) || 'null');
    return c && typeof c === 'object' && !Array.isArray(c) ? c : null;
  } catch { return null; }
}

export function saveConfig(storage, token, c) {
  try { storage.setItem(cfgKey(token), JSON.stringify(slimConfig(c))); } catch { /* quota / private mode */ }
}

/** The config to render with before the live fetch: the cached one, else (full screen only) defaults; null = wait for the fetch.
 *  Page overrides (name, accent) win, as they do over the live config. */
export function bootConfig({ cached, name = '', accent = '', fullscreen = false } = {}) {
  const base = cached || (fullscreen ? { name: 'Anís', accent: '#0f5f73', position: 'bottom-right', placeholder: 'Ask a question…' } : null);
  if (!base) return null;
  return { ...base, ...(name ? { name } : {}), ...(accent ? { accent } : {}) };
}
