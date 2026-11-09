// Humanized progress for live channels (Chad 11-08): a stage that starts says so, in Anís's voice, as a {type:'status', text}
// event (the widget replaces its status line). Only channels with `progress` (channels.js: live chats, later voice) — never email.
// Wording = template rows narrate.<key> (narration-seed.js), one variant per line. No such row → silent. Deps: activities/templates.
import { template, fill } from './activities/templates.js';

/** Emit the status line for `key`; returns the text, or null when the channel is not live / the key has no words. Never throws. */
export function narrate(onEvent, channel, key, slots = {}, { rand = Math.random } = {}) {
  if (!channel?.progress || typeof onEvent !== 'function') return null;
  try {
    const lines = template(`narrate.${key}`).split('\n').map((l) => l.trim()).filter(Boolean);
    const text = lines.length ? fill(lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))], slots).replace(/\s+/g, ' ').trim() : '';
    if (!text) return null;
    onEvent({ type: 'status', text });
    return text;
  } catch { return null; }
}
