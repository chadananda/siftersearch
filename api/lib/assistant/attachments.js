// What a reader ATTACHED to a letter, read for Anís (10-23 Liliane: "Below is the picture of the prayer in farsi … can you
// translate this" — the photo was dropped at the door and Anís answered "the picture itself hasn't reached me"). Images are
// transcribed verbatim (any script) by a vision model; the file name is kept too (hers named the book, prayer and pages).
// The result is appended to the reader's own message, so research and writing see it as what they sent. Deps: role-client.
import { roleCreate } from '../role-client.js';

export const IMAGE_TYPES = /^image\/(jpe?g|png|webp|gif)$/i;
export const MAX_IMAGES = 4;
const MAX_BYTES = 8 * 1024 * 1024;

export const READ_PROMPT = `A reader attached this image to a letter to a study assistant for sacred texts. Read it.
1. TEXT: transcribe every line of printed or handwritten text EXACTLY as it appears, in its own script (Persian, Arabic,
   Hebrew, English…), in reading order, one line per line; keep headings (e.g. هو الله), numbers, signatures (e.g. ع ع) and page
   numbers. Never translate, correct or complete it; mark an unreadable word […].
2. WHAT IT IS: one line — e.g. "two facing pages of a printed Persian prayer book, prayer 51 on pp. 51–52".
Answer in exactly this form:
TEXT:
<lines>
WHAT IT IS: <one line>`;

/** Attachments as the Worker sends them ({ name, type, size, data: base64 }) → the ones Anís can read. Pure. */
export function readable(atts = []) {
  return (Array.isArray(atts) ? atts : []).filter((a) => a && IMAGE_TYPES.test(a.type || '') && a.data && (a.size ?? 0) <= MAX_BYTES).slice(0, MAX_IMAGES);
}

/** One image → { name, text, what } (text '' when nothing could be read). */
export async function readImage(a, { create = roleCreate } = {}) {
  const res = await create('anis-read-attachment', { max_tokens: 4000, temperature: 0, messages: [{ role: 'user', content: [
    { type: 'text', text: READ_PROMPT }, { type: 'image_url', image_url: { url: `data:${a.type};base64,${a.data}` } }] }] });
  const out = String(res?.choices?.[0]?.message?.content || '');
  const text = (out.match(/TEXT:\s*\n?([\s\S]*?)(?:\n\s*WHAT IT IS:|$)/i)?.[1] || '').trim();
  const what = (out.match(/WHAT IT IS:\s*(.*)/i)?.[1] || '').trim();
  return { name: a.name || 'image', text, what };
}

/** The note appended to the reader's message: what each attachment is, its file name, and its text. Pure. */
export function attachmentNote(read = [], skipped = []) {
  const parts = read.map((r) => `[Attached image "${r.name}"${r.what ? ` — ${r.what}` : ''}. Its text, transcribed from the image:]\n${r.text || '(no text could be read from it)'}`);
  for (const s of skipped) parts.push(`[Attached file "${s.name}" (${s.type || 'unknown type'}) — not readable here; say so and ask for it as an image or typed text]`);
  return parts.join('\n\n');
}

/** messages + attachments → messages whose LAST user turn carries the attachments' text. Unreadable → the note says so. */
export async function withAttachments(messages, atts, { create = roleCreate, log = null } = {}) {
  if (!atts?.length) return messages;
  const ok = readable(atts);
  const skipped = atts.filter((a) => !ok.includes(a)).map((a) => ({ name: a.name, type: a.type }));
  const read = [];
  for (const a of ok) {
    try { read.push(await readImage(a, { create })); } catch (err) { log?.warn?.({ err: String(err?.message).slice(0, 160), name: a.name }, 'anis: attachment read failed'); skipped.push({ name: a.name, type: a.type }); }
  }
  const note = attachmentNote(read, skipped);
  if (!note) return messages;
  const out = messages.map((m) => ({ ...m }));
  const i = out.map((m) => m.role).lastIndexOf('user');
  if (i < 0) return [...out, { role: 'user', content: note }];
  out[i].content = `${out[i].content || ''}\n\n${note}`.trim();
  return out;
}
