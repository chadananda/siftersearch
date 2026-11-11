// The welcome letter in the reader's language (F11). Template text in, same letter out; Anís stays "he", identity and
// OceanLibrary.com stay; never names siftersearch.com. complete is injectable (tests). Deps: role-client.
import { roleReplyCap } from './reply-cap.js';
export const WELCOME_RULES = `Translate this letter into the language with code "{lang}". Keep it warm and exactly as long. Anís is a HE (masculine self-reference where the language marks gender). Keep "Anís", "Ocean AI Research Assistant", "Ocean 2.0", "OceanLibrary.com", every Arabic/Persian line and Markdown (quotes, list, > blockquote) unchanged. Do not add or remove anything. Output JSON: {"subject": "...", "body": "..."}.`;

export async function translateWelcome({ subject, body, lang }, { complete } = {}) {
  const call = complete || (async (params) => (await (await import('../role-client.js')).roleCreate('anis-agent', params)).choices?.[0]?.message?.content);
  const out = await call({ messages: [{ role: 'system', content: WELCOME_RULES.replace('{lang}', lang) }, { role: 'user', content: JSON.stringify({ subject, body }) }], max_tokens: roleReplyCap('anis-agent') });
  const m = String(out || '').match(/\{[\s\S]*\}/);
  let j; try { j = JSON.parse(m?.[0] || ''); } catch { return null; }
  if (!j?.subject || !j?.body || /siftersearch/i.test(`${j.subject}${j.body}`)) return null;
  return { subject: String(j.subject), body: String(j.body) };
}

/** The note Anís sends when a reader connects their Google account (widget One Tap): from Anís, and it tells them they can
 *  write to him. Promises nothing recurring and never names the backend (Chad 11-11). Pure. */
export function connectedLetter({ name = null, site = null } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const hello = first ? `Hello ${first[0].toUpperCase()}${first.slice(1)},` : 'Hello,';
  // the widget profile's own name ("Anis", or a backend name) is not a site to name; a partner site is
  const where = site && !/^an[ií]s$|sifter/i.test(String(site).trim()) ? ` on ${site}` : '';
  return {
    subject: 'You\u2019re connected \u2014 you can also write to me',
    text: `${hello}

You\u2019ve just connected your Google account${where}, so our conversations are kept with your account. I\u2019m Anís, the Ocean AI Research Assistant of Ocean 2.0 at OceanLibrary.com.

You can also ask me questions by email. Just reply to this letter, or write to anis@oceanlibrary.com whenever a question comes to you: where a quotation comes from, what the writings say about a subject, who someone was, or what to read next. I\u2019ll answer with the passages themselves and links to read them in full, and if I can\u2019t find something, I\u2019ll say so.`,
  };
}
