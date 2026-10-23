// SPEAKER IDENTITY (Chad 10-23: "we need more flexible identities for authors. We cannot make a new author because of a
// variant in spelling (like using initials instead of name)"). Every speaker string resolves to ONE person (a canonical key
// + the house-style display name) or to a review case — never a new person per spelling. Name forms match through folding
// (diacritics, ’ ' ‘, hyphens, dots, titles) and initials ("A.Q." ↔ "Abu'l-Qásim"); a surname alone, or a name more than one
// person fits, is NOT merged on the name: the evidence (works, series/collection/channel, dates against the lifespan)
// decides, else the case is held for review. A Covenant-breaker is never resolved to. People: data/media-speaker-people.json
// (+ entity_id into the biography graph where known). Pure.

const TITLES = /^(?:mr|mrs|ms|miss|dr|prof|professor|sir|lady|haji|jinab|jinabi|jenab|janab|counsellor|counselor|hand|of|the|cause|god|amatul|baha|amatulbaha)$/;
const SURNAME_VARIANTS = { fayzi: 'faizi', faizy: 'faizi', khadim: 'khadem', khademi: null, furutan: 'furutan', nakhjavany: 'nakhjavani', grossman: 'grossmann' };

/** A name → its folded tokens (no titles; "Abu'l-Qásim" → abul qasim; "A.Q." → a q). Parentheses are dropped. */
export function nameTokens(name) {
  let s = String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ')
    .replace(/[’‘ʼʻ`´'"“”]/g, '').toLowerCase();
  s = s.replace(/hand of the cause(?: of god)?/g, ' ').replace(/amatu?l[\s-]*baha/g, ' ');
  const toks = s.replace(/[^a-z]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  // strip leading titles only (a surname such as "Haney" stays)
  while (toks.length > 1 && TITLES.test(toks[0])) toks.shift();
  if (toks.length) { const last = toks[toks.length - 1]; if (SURNAME_VARIANTS[last]) toks[toks.length - 1] = SURNAME_VARIANTS[last]; }
  return toks;
}
const isInitial = (t) => t.length === 1;
const tokOk = (x, y) => x === y || (isInitial(x) && y[0] === x) || (isInitial(y) && x[0] === y);

/** Do two FULL name forms fit one person? Same surname, and the given names agree in order (a token = the same token or
 *  its initial; one side may carry extra middle names). A form without a given name is never "compatible" here. */
export function compatible(a, b) {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (ta.length < 2 || tb.length < 2) return false;
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
  const ga = ta.slice(0, -1), gb = tb.slice(0, -1);
  // collapse a run of initials into one token-per-initial ("a q" stays two); compare the first given names in order
  const n = Math.min(ga.length, gb.length);
  for (let i = 0; i < n; i++) if (!tokOk(ga[i], gb[i])) return false;
  // a full first name on BOTH sides must be equal (initials only are weaker): "Riaz" ≠ "Zikrullah"
  return true;
}
const surnameOf = (name) => { const t = nameTokens(name); return t.length ? t[t.length - 1] : null; };
const formsOf = (p) => [p.name, ...(p.aliases || [])];
const yearsIn = (s) => [...String(s || '').matchAll(/\b(1[89]\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
const textHas = (hay, needle) => { const h = ` ${nameTokens(hay).join(' ')} `, n = nameTokens(needle).join(' '); return !!n && h.includes(` ${n} `); };

/** Evidence that an item (ctx: { title, collection, series, channel, year, source_kind }) is by person p: a score and why. */
export function evidenceFor(p, ctx = {}) {
  let score = 0; const why = [];
  const blob = [ctx.title, ctx.collection, ctx.series, ctx.channel].filter(Boolean).join(' · ');
  for (const w of p.works || []) if (textHas(blob, w)) { score += 2; why.push(`work "${w}"`); break; }
  if (formsOf(p).some((f) => nameTokens(f).length >= 2 && textHas(blob, f))) { score += 2; why.push('full name in the series/collection/channel'); }
  const y = ctx.recorded_year ?? null;
  if (y && p.died && y > p.died) { score -= 3; why.push(`recorded ${y}, after death ${p.died}`); }
  else if (y && p.born && y < p.born + 15) { score -= 3; why.push(`recorded ${y}, too early`); }
  else if (y && (p.died || p.born)) { score += 1; why.push(`${y} within the lifespan`); }
  return { score, why };
}

/**
 * A speaker string (+ the item's context) → { key, display, person, basis } | { review, candidates } | { unknown: true }.
 * people: [{ key, name (house style), aliases[], born?, died?, role?, works[]?, cb? }].
 */
export function resolveSpeaker(name, people = [], ctx = {}) {
  const toks = nameTokens(name);
  if (!toks.length || /^(?:audience|questioner|interpreter|narrator|chair|various|unknown|misc|speaker)$/.test(toks.join(' '))) return { unknown: true };
  const sur = toks[toks.length - 1];
  const same = people.filter((p) => formsOf(p).some((f) => surnameOf(f) === sur));
  if (toks.length >= 2) {
    let fits = same.filter((p) => formsOf(p).some((f) => compatible(name, f)));
    // a FULL given name that matches one person's full given name outranks an initials-only alias of another
    // ("Hartmut Grossmann" fits "H. Grossmann" = Hermann too; Hartmut's own name decides)
    const givenFull = toks.slice(0, -1).some((t) => !isInitial(t));
    if (givenFull && fits.length > 1) {
      const full = fits.filter((p) => formsOf(p).some((f) => { const ft = nameTokens(f); return ft.length >= 2 && ft.slice(0, -1).every((t) => !isInitial(t)) && compatible(name, f); }));
      if (full.length) fits = full;
    }
    const safe = fits.filter((p) => !p.cb);
    if (fits.length && !safe.length) return { review: 'the name fits a Covenant-breaker — never linked', candidates: fits.map((p) => p.key) };
    if (safe.length === 1) {
      // an initials-only form is a weaker match: another person of that surname whose initials also fit makes it a review case
      const initialsOnly = toks.slice(0, -1).every(isInitial);
      const rivals = initialsOnly ? same.filter((p) => p !== safe[0] && formsOf(p).some((f) => compatible(name, f))) : [];
      if (!rivals.length) return { key: safe[0].key, display: safe[0].name, person: safe[0], basis: initialsOnly ? 'initials fit one person' : 'name form' };
    }
    if (safe.length > 1) {
      const scored = safe.map((p) => ({ p, ...evidenceFor(p, ctx) })).sort((a, b) => b.score - a.score);
      if (scored[0].score >= 2 && scored[1].score < 2) return { key: scored[0].p.key, display: scored[0].p.name, person: scored[0].p, basis: `name + ${scored[0].why.join(', ')}` };
      return { review: `${safe.length} people fit "${name}"`, candidates: safe.map((p) => p.key) };
    }
    return { unknown: true };
  }
  // a surname-only form a person CONFIRMED as theirs (data: "confirmed": [...], after review) resolves directly
  const confirmed = people.filter((p) => !p.cb && (p.confirmed || []).some((f) => nameTokens(f).join(' ') === toks.join(' ')));
  if (confirmed.length === 1) return { key: confirmed[0].key, display: confirmed[0].name, person: confirmed[0], basis: 'confirmed form (reviewed)' };
  // a SURNAME alone: only with evidence, and only when exactly one person of that surname has it
  const cands = same.filter((p) => !p.cb).map((p) => ({ p, ...evidenceFor(p, ctx) })).sort((a, b) => b.score - a.score);
  if (cands.length && cands[0].score >= 2 && (cands.length === 1 || cands[1].score < 2)) {
    return { key: cands[0].p.key, display: cands[0].p.name, person: cands[0].p, basis: `surname + ${cands[0].why.join(', ')}` };
  }
  return cands.length ? { review: `surname only — ${cands.length} known ${cands.length === 1 ? 'person' : 'people'} named ${sur}, evidence insufficient`, candidates: cands.map((c) => c.p.key) }
    : { unknown: true };
}

/** The year a talk was RECORDED (not uploaded) as far as its title / description / file name say, within the lifespan.
 *  → { recorded_year, uploaded_year, flag } — flag when the only year we have is after the speaker's death. */
export function recordingYear({ year = null, source_kind = null, title = '', description = '', file = '' } = {}, person = null) {
  const died = person?.died || null, born = person?.born || null;
  const ok = (y) => (!died || y <= died) && (!born || y >= born + 10);
  const said = [...yearsIn(title), ...yearsIn(file), ...yearsIn(description)].filter(ok);
  if (source_kind === 'youtube') {
    // a YouTube item's year is its UPLOAD year unless the title or description names an earlier one
    const rec = said.length ? Math.min(...said) : null;
    return { recorded_year: rec, uploaded_year: year || null, flag: !rec && died && year && year > died ? `uploaded ${year}, after the speaker's death (${died}); recording year unknown` : null };
  }
  if (year && died && year > died) return { recorded_year: said.length ? Math.min(...said) : null, uploaded_year: null, flag: `year ${year} is after the speaker's death (${died})` };
  return { recorded_year: year, uploaded_year: null, flag: null };
}
