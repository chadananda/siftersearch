// Step 6 (planning/donor-intake-plan-20261030.md): what a worker's sample says about an item, deterministically (no LLM).
// A talk's first-minute transcript → language, speech or none, a speaker named in an introduction; a book's first pages →
// proposed title / author / year from the title page, language by script, Bahá'í terms present or not. → rec { title, creator,
// year, lang, why, destination, score }. Pure. The catalogue's own why stays; the sample's evidence is added to it.

const FAITH = /bah[aá]['’ʼ]?u['’ʼ]?ll[aá]h|bah[aá]['’ʼ]?[ií]|\bb[aá]b\b|abdu['’ʼ]?l-?bah[aá]|shoghi effendi|universal house of justice|kit[aá]b-?i-?(?:aqdas|[ií]q[aá]n)|ridv[aá]n|na[w]?r[uú]z|mashriqu|bah[aá]['’ʼ]?/i;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const short = (s, n = 160) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
/** Language by script, for OCR'd or extracted text: ar/fa script → 'ar' (Persian and Arabic share it; a person tells them apart). */
export function scriptLang(text) {
  const t = String(text || ''), letters = (t.match(/\p{L}/gu) || []).length;
  if (letters < 40) return null;
  const arabic = (t.match(/[؀-ۿ]/g) || []).length;
  if (arabic / letters > 0.3) return /[پچژگ]/.test(t) ? 'fa' : 'ar';
  return /[a-z]/i.test(t) ? 'en' : null;
}
/** A speaker introduced in the opening ("our speaker tonight is Mr. William Sears", "please welcome Dr. Daniel Jordan"). */
export function introducedSpeaker(text) {
  const m = /(?:speaker (?:tonight|today|this evening) is|(?:please )?welcome|introduc(?:e|ing)|present(?:ing)?|talk by|address by)(?:\s+to\s+you)?(?:\s+(?:tonight|today|this evening|now))?\s+((?:(?:Mr|Mrs|Ms|Miss|Dr|Prof|Professor|Hand of the Cause)\.?\s+)?[A-Z][a-zA-Z'’-]+(?:\s+[A-Z](?:[a-zA-Z'’-]+|\.)){1,3})/.exec(String(text || ''));
  return m ? m[1].replace(/[.,]$/, '').trim() : null;
}
/** Title page → { title, author, year }: the first substantial lines; "by X" names the author. */
export function titlePage(text) {
  const all = String(text || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20);
  const lines = all.filter((l) => /\p{L}{3}|^by$/iu.test(l));
  const by = lines.findIndex((l) => /^by(?:\s+\S|$)/i.test(l));
  const author = by < 0 ? null : (lines[by].replace(/^by\s*/i, '') || lines[by + 1] || '').slice(0, 80) || null;
  const head = (by > 0 ? lines.slice(0, by) : lines.slice(0, 3)).filter((l) => l.length <= 120 && !/^(?:copyright|©|isbn|printed|published|all rights)/i.test(l));
  const title = head.slice(0, 2).join(': ').slice(0, 160) || null;
  const y = /\b(18[4-9]\d|19\d\d|20[0-2]\d)\b/.exec(all.join(' '));
  return { title, author, year: y ? Number(y[1]) : null };
}

/** item (intake_items row) + sample (intake_sample.py's sample.json) → rec. */
export function recommendFromSample(item, s) {
  // base = the catalogue's score, kept on the rec so a re-recommendation (rules improved) starts from it, not from the last rec's
  const base = Number(item.sample?.rec?.base ?? item.score) || 0, text = String(s?.text || ''), notes = [];
  let score = base, title = null, creator = null, year = null, lang = null;
  if (s?.kind === 'talk') {
    lang = s.language || null;
    // the transcript's words decide; speech_s is informational
    if (text.split(/\s+/).filter(Boolean).length < 8) { score -= 20; notes.push('no speech heard in the first minute (music, silence or a blank tape?)'); }
    else {
      notes.push(`First minute${lang && lang !== 'en' ? ` (${lang})` : ''}: “${short(text)}”`);
      creator = item.creator ? null : introducedSpeaker(text);
      if (creator) notes.push(`speaker introduced as ${creator}`);
      if (FAITH.test(text)) score += 5;
    }
  } else {
    const tp = titlePage(text);
    lang = scriptLang(text);
    if (text.replace(/\W/g, '').length < 100) { score -= 10; notes.push(`nothing readable in the first ${s?.pages || 'few'} pages${s?.ocr ? ' (even by OCR)' : ''}`); }
    else {
      title = tp.title; creator = item.creator ? null : tp.author; year = item.year ? null : tp.year;
      notes.push(`Title page reads: “${short(tp.title || text, 120)}”`);
      if (FAITH.test(text)) score += 5;
      else if (text.length > 1500) { score -= 15; notes.push("no Bahá'í terms in the first pages — check that it belongs"); }
    }
  }
  return { title, creator, year, lang, why: [item.why, ...notes].filter(Boolean).join(' '), destination: item.destination || null, score: clamp(score), base, from: s?.kind || null };
}

/** The "More info" answer shown on the item: what the deeper look found, under the question asked. */
export function infoAnswer(question, s) {
  const text = String(s?.text || '').trim();
  const what = s?.kind === 'talk' ? `First ${Math.round((s.secs || 0) / 60)} min transcript${s.language ? ` (${s.language})` : ''}` : `First ${s?.pages || '?'} pages${s?.ocr ? ' (OCR)' : ''}`;
  return `${question ? `Asked: ${question}\n` : ''}${what}:\n${text ? short(text, 4000) : '(nothing readable)'}`;
}
