// The welcome letter in the reader's language (F11). Template text in, same letter out; Anís stays "he", identity and
// OceanLibrary.com stay; never names siftersearch.com. complete is injectable (tests). Deps: role-client.
export const WELCOME_RULES = `Translate this letter into the language with code "{lang}". Keep it warm and exactly as long. Anís is a HE (masculine self-reference where the language marks gender). Keep "Anís", "Ocean AI Research Assistant", "Ocean 2.0", "OceanLibrary.com", every Arabic/Persian line and Markdown (quotes, list, > blockquote) unchanged. Do not add or remove anything. Output JSON: {"subject": "...", "body": "..."}.`;

export async function translateWelcome({ subject, body, lang }, { complete } = {}) {
  const call = complete || (async (params) => (await (await import('../role-client.js')).roleCreate('anis-agent', params)).choices?.[0]?.message?.content);
  const out = await call({ messages: [{ role: 'system', content: WELCOME_RULES.replace('{lang}', lang) }, { role: 'user', content: JSON.stringify({ subject, body }) }], max_tokens: 2500 });
  const m = String(out || '').match(/\{[\s\S]*\}/);
  let j; try { j = JSON.parse(m?.[0] || ''); } catch { return null; }
  if (!j?.subject || !j?.body || /siftersearch/i.test(`${j.subject}${j.body}`)) return null;
  return { subject: String(j.subject), body: String(j.body) };
}
