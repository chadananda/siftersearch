// Scene extraction: prompt + parse + participant binding (pure). Runner: scripts/extract-scenes.mjs.
// A scene = named people PHYSICALLY together (a meeting, gathering, journey, siege, imprisonment), with where/when and a
// verbatim proof. Every pair of bound participants becomes "present with" evidence for who-met-whom.
export const SCENE_VERSION = 'scenes-v2';   // v2: the model binds participants to a numbered candidate list; no pronouns

export const SYSTEM = `You read ONE paragraph of a historical narrative and list every SCENE in it: an occasion when two or more NAMED people were physically together — a meeting, visit, gathering, lecture, journey together, siege, imprisonment, martyrdom together.
For each scene give:
- participants: EVERY NAMED person present, with their role in the scene (host, guest, speaker, preacher, listener, companion, prisoner, visitor…). Include a person the paragraph identifies indirectly — "the preacher… was none other than Mullá Ḥusayn" makes Mullá Ḥusayn a participant (role: preacher). Use the name as the paragraph writes it. Never list a pronoun ("he", "His"), the narrator, or an unnamed person ("my father", "a merchant"); do not add people only mentioned in passing or absent.
- for each participant, "id": the number of that person in CANDIDATES when the paragraph and NOTE make the identity certain (e.g. "Mírzá ‘Alí-Muḥammad, that young Siyyid of Shíráz" is the Báb), else null. Never guess; a namesake is not the same person.
- place, and time if stated (never guess a date).
- summary: one short sentence of what happened.
- proof: the paragraph's own words, copied EXACTLY (≤200 chars), that show these people were together.
Rules: only what THIS paragraph narrates as having happened — not hopes, plans, rumours, hypotheticals, or dreams; a denied meeting is not a scene. A letter or message is not being together. If there is no scene, return an empty list.
Why: scholars ask "who was present when…" and "did X ever meet Y"; one room with four people must yield all four.
Example: "…invite Him to visit his house, where Siyyid Káẓim was expected to attend a Rawdih-Khani… Siyyid Káẓim immediately rose… And the preacher who occupied the pulpit was momentarily struck dumb… This preacher was none other than Mullá Ḥusayn-i-Bushrú'í" → {"scenes":[{"place":"Mullá Sadiq's house, Karbilá","time":null,"summary":"At a rawḍih-khání, Siyyid Káẓim honours the young Siyyid of Shíráz; the preacher Mullá Ḥusayn is struck dumb","proof":"And the preacher who occupied the pulpit was momentarily struck dumb","participants":[{"name":"Mullá Sadiq","role":"host"},{"name":"Siyyid Káẓim","role":"chief guest"},{"name":"Mírzá ‘Alí-Muḥammad","role":"guest"},{"name":"Mullá Ḥusayn-i-Bushrú'í","role":"preacher"}]}]}
Return ONLY JSON: {"scenes":[{"place":"...","time":"...|null","summary":"...","proof":"...","participants":[{"name":"...","role":"...","id":<number|null>}]}]}`;

export function buildUser(p, candidates = []) {
  const cand = candidates.length ? `CANDIDATES (known people — use the number):\n${candidates.map((c) => `#${c.id} ${c.name}${c.aliases?.length ? ` (also: ${c.aliases.slice(0, 4).join('; ')})` : ''}`).join('\n')}\n\n` : '';
  return `${cand}${p.context ? `NOTE (who is who): ${String(p.context).slice(0, 600)}\n\n` : ''}PARAGRAPH (${p.title || 'source'}):\n${String(p.text || '').slice(0, 4000)}`;
}

const PRONOUN = /^(he|she|him|her|his|they|them|it|i|we|me|my\b.*|the narrator|narrator|himself|herself|an? \w+|someone|somebody)$/i;
export const isPronoun = (name) => PRONOUN.test(String(name || '').trim());

export function parseScenes(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return (JSON.parse(m[0]).scenes || []).filter((s) => s && s.proof && Array.isArray(s.participants) && s.participants.length >= 2)
      .map((s) => ({ place: s.place || null, time: s.time || null, summary: String(s.summary || '').slice(0, 300), proof: String(s.proof).slice(0, 300),
        participants: s.participants.filter((x) => x && x.name && !isPronoun(x.name))
          .map((x) => ({ name: String(x.name).slice(0, 120), role: x.role ? String(x.role).slice(0, 60) : null, id: Number.isInteger(Number(x.id)) && Number(x.id) > 0 ? Number(x.id) : null })) }))
      .filter((s) => s.participants.length >= 2);
  } catch { return null; }
}

const norm = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
/** The proof must be the paragraph's own words (first 120 chars must occur). */
export function proofInParagraph(proof, text) {
  const p = norm(proof).replace(/[“”"]/g, '');
  return p.length > 8 && norm(text).replace(/[“”"]/g, '').includes(p.slice(0, 120));
}

/**
 * Bind a participant name to ONE of the paragraph's candidate entities (those mentioned in it or named in its text).
 * matches(name, candidate) decides; exactly one distinct match binds, anything else stays unbound (never guessed).
 */
export function bindParticipant(name, candidates, matches) {
  const ids = [...new Set(candidates.filter((c) => matches(name, c)).map((c) => c.id))];
  return ids.length === 1 ? ids[0] : null;
}
