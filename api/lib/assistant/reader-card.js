// The READER CARD: who is asking, in a few lines, read by every Jev decision and the resolver before the writer sees the
// turn (Chad 11-03: "ensure we have conversation history as context and user persona card"). Built from what the channel
// knows (signed in, email, widget) and the Seeker Companion store: relationship stage, remembered facts, premises, study
// tracks, an open reading. Deps: companion/store (injectable; every read fails soft). Never throws.
import { companionStore } from '../companion/index.js';

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** → one paragraph (≤ ~600 chars). Pure. */
export function renderReaderCard({ participant = {}, channel = null, relationship = null, memory = [], premises = [], enrollments = [], reading = null, language = null } = {}) {
  const who = participant.authed ? 'a signed-in reader' : participant.id ? 'a returning visitor (not signed in)' : 'an anonymous visitor';
  const via = channel ? ` via ${String(channel.id || channel)}` : '';
  const lines = [`${who}${via}`];
  if (relationship?.stage) lines.push(`relationship: ${relationship.stage}`);
  if (language) lines.push(`writes in ${language}`);
  const mem = (memory || []).filter((m) => m && !m.corrected).slice(0, 6).map((m) => clip(m.kind ? `${m.kind}: ${m.content}` : m.content, 110));
  if (mem.length) lines.push(`remembered: ${mem.join(' · ')}`);
  const pre = (premises || []).slice(0, 3).map((p) => clip(p.text || p.content || p.premise, 90)).filter(Boolean);
  if (pre.length) lines.push(`holds that: ${pre.join(' · ')}`);
  const tracks = (enrollments || []).filter((e) => !e.status || e.status === 'active').map((e) => e.track_id || e.track).filter(Boolean).slice(0, 3);
  if (tracks.length) lines.push(`studying: ${tracks.join(', ')}`);
  if (reading?.title) lines.push(`reading now: ${clip(reading.title, 80)}${reading.at ? ` (at ${clip(reading.at, 60)})` : ''}`);
  if (lines.length === 1) lines.push('nothing remembered yet');
  return lines.join('; ');
}

/** Loads the card for a participant. → { text, data }. Anonymous first contact needs no store reads. */
export async function loadReaderCard(participant = {}, { channel = null, store = companionStore, reading = null, language = null } = {}) {
  const id = participant.id || null;
  const soft = (p, d) => Promise.resolve(p).catch(() => d);
  const [relationship, memory, premises, enrollments] = id && store ? await Promise.all([
    soft(store.getRelationship?.(id), null), soft(store.getMemory?.(id), []), soft(store.getPremises?.(id), []), soft(store.getEnrollments?.(id), [])]) : [null, [], [], []];
  const data = { participant, channel, relationship, memory: memory || [], premises: premises || [], enrollments: enrollments || [], reading, language };
  return { text: renderReaderCard(data), data };
}
