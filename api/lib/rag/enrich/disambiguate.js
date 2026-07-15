// enrich/disambiguate — make each passage self-contained: a faithful note (place · era · running idea ·
// name resolutions) so a later English-reading model can place the passage blind. The GATE stage: its
// output (a per-paragraph context note) is what every downstream stage requires.
//
// Design: STABLE-PREFIX-HEAVY, VARIABLE-TAIL-LIGHT for cache — the big SYSTEM prompt (rules + book meta +
// cast) is byte-identical across the book; the USER message is just SCENE + a tiny carried STATE + the one
// paragraph. Output is REQUIRED-field JSON {place,era,idea,resolve[]} → structurally never empty. Faithful:
// the text's own qualifier beats prominence; honorifics kept; UNDER-resolve. Model + version come from the
// profile/config (host), never named here.
import { profileFor } from '../kernel/profile.js';   // per-doc routing (language → model)
import { segment } from '../kernel/segment.js';       // partition into cache-friendly, concurrent units
import { pool } from '../kernel/run.js';              // bounded-concurrency map

const DENSE_HINT = 'This passage is dense — resolve ONLY the few most ambiguous names (short handles), keep "idea" to one clause, and output ONLY the compact JSON object. Brevity prevents truncation.';

export async function run(ctx, docId, opts = {}) {
  const profile = await profileFor(ctx, docId);
  const [meta, all, cast] = await Promise.all([ctx.store.getDocMeta(docId), ctx.store.getParagraphs(docId), castOf(ctx, docId)]);
  const version = opts.version ?? ctx.config.versions?.disambig ?? 'disambig-v1'; // method tag is host config
  const paras = (opts.resume ?? true) ? all.filter((p) => p.contextModel !== version) : all;
  const segs = segment(paras, { mode: profile.segmentation, segMax: opts.segMax ?? 60 });
  const system = buildSystem(profile, meta, cast);
  const route = { model: opts.model ?? profile.models.disambig, fallback: opts.fallback ?? profile.fallback };
  const maxTokens = (m) => (ctx.catalog.get(m)?.capabilities?.includes('reasoning') ? 4000 : 1500); // reasoning models emit more
  const latin = profile.script === 'latin';
  const stats = { paras: paras.length, segments: segs.length, done: 0, failed: 0, escalated: 0, dropped: 0 };
  // Report per PARAGRAPH (not per segment): a segment is many sequential model calls, so per-segment reporting
  // would go flat for a whole window. Report ABSOLUTE progress: total = ALL prose (all.length), already-done =
  // resume-skipped (base), so a resumed run's bar reflects true progress (not just the remaining slice).
  const base = all.length - paras.length;
  const report = () => opts.onProgress?.(base + stats.done + stats.failed, all.length);

  // Each segment is one warm cache; within it, calls are sequential and carry a tiny STATE (place · era · a
  // few recent resolves) so consecutive same-scene calls share SYSTEM+SCENE+STATE. Segments run concurrently.
  await pool(opts.concurrency ?? 5, segs, async (seg) => {
    let place = '', era = '', known = [];
    for (const p of seg) {
      const user = buildUser(p, { place, era, known });
      const { parsed, escalated } = await ctx.model.runLadder({ route, system, user, parse: parseNote, maxTokens, denseHint: DENSE_HINT });
      if (!parsed) { stats.failed++; report(); continue; }
      const resolve = latin ? gateResolves(parsed.resolve, p.text) : parsed.resolve; // drop invented names (Latin only)
      stats.dropped += parsed.resolve.length - resolve.length;
      if (parsed.place) place = parsed.place;
      if (parsed.era) era = parsed.era;
      if (resolve.length) { known.push(...resolve); while (known.length > 5) known.shift(); }
      if (!opts.dryRun) await ctx.store.saveContext(p.id, renderNote({ ...parsed, resolve }), version);
      stats.done++; if (escalated) stats.escalated++; report();
    }
  });
  ctx.log.info?.({ docId, ...stats }, 'disambiguate');
  return stats;
}

const castOf = (ctx, docId) => (ctx.store.getCastSeed ? Promise.resolve(ctx.store.getCastSeed(docId)).catch(() => '') : Promise.resolve(''));

// ── Pure helpers (unit-tested directly) ──────────────────────────────────────

// Parse the model's JSON note. Returns null if there is no object or no `idea` (a required field → a valid
// note is structurally non-empty). Tolerant of ```json fences and trailing prose via brace extraction.
export function parseNote(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (!j.idea || !String(j.idea).trim()) return null;
    const resolve = Array.isArray(j.resolve) ? j.resolve.filter((s) => typeof s === 'string' && s.includes('=')).map((s) => s.trim()) : [];
    return { place: String(j.place || '').trim(), era: String(j.era || '').trim(), idea: String(j.idea).trim(), resolve };
  } catch { return null; }
}

// Proof gate for resolutions: a resolved name's left side must appear verbatim in the passage, else the
// model invented it → drop it. Caller applies this for Latin-script docs only (non-Latin source transliterates
// the name, which legitimately won't string-match the original script).
export function gateResolves(resolve, passage) {
  return resolve.filter((r) => {
    const lhs = r.split('=')[0].trim().replace(/^["'“”]+|["'“”]+$/g, '');
    return lhs.length < 2 || passage.includes(lhs);
  });
}

// Render the note object to the stored string form. Surfaces are QUOTED — matching the corpus format the
// mention parser reads (a bare "surface" = handle, `;`-separated), so old and new notes parse identically.
export function renderNote({ place, era, idea, resolve = [] }) {
  const quoted = resolve.map((r) => {
    const i = r.indexOf(' = ');
    return i < 0 ? r : `"${r.slice(0, i).trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')}" = ${r.slice(i + 3).trim()}`;
  });
  return `@${place || '?'}, ~${era || '?'} — ${idea}${quoted.length ? ` · ${quoted.join('; ')}` : ''}`;
}

// ── Prompt construction (pure) ───────────────────────────────────────────────

const LANG_NAME = { en: 'English', fa: 'Persian', ar: 'Arabic', he: 'Hebrew' };

export function buildSystem(profile, meta, cast = '') {
  const lang = LANG_NAME[profile.lang] || profile.lang;
  const foreign = profile.lang !== 'en' ? ` written in ${lang} (${profile.script} script) — READ the ${lang} passage and write your note in ENGLISH` : '';
  const bookMeta = [`"${meta.title}" by ${meta.author || '?'}`, [meta.religion, meta.collection].filter(Boolean).join(' / '), meta.year ? `Year ${meta.year}` : '', meta.description ? `About: ${String(meta.description).slice(0, 240)}` : ''].filter(Boolean).join('\n');
  return `You output a compact disambiguation note as JSON for ONE passage of a ${profile.genre} work${foreign}, so a later English-reading AI that has NOT seen the surrounding text can place the passage and tell who/what is meant. Output JSON ONLY.

Return exactly: {"place":"…","era":"… [pin|est]","idea":"…","resolve":["<name as written> = <fuller handle>", …]}

ALWAYS fill place, era, and idea — never blank; there is always a locus (place OR section of the work), a time, and a thread. "resolve" MAY be [] when no name needs it.
• place / era — the location (or work-section) and time in force. Inherit from STATE; change only when THIS passage moves. Mark era "[pin]" when stated or anchored (${profile.eraAnchors || 'a stated date, a named era, or "N years after" a known epoch — compute it'}), else "[est]".
• idea — the subject / argument / thread this passage develops, in a few words. This alone makes the note useful when no name needs resolving.
• resolve — for each bare, elided, variant, or ambiguous name/epithet, "<name> = <fuller handle>". Keep each handle SHORT (canonical name + at most a two-word role). Use ONLY a handle the passage, scene, or CAST supports — never invent a nisba or upgrade a name to a famous namesake. The text's own qualifier BEATS prominence. Keep honorifics. Use the most-used handle. Unsure → keep as written + "?"; UNDER-resolve rather than over-resolve; skip names already in full and obvious pronouns; in quoted speech I/We = the speaker.
• SCENE COREFERENCE — when an epithet, role, office, or relationship phrase refers to a person this passage or its scene NAMES, resolve it to that person's SAME handle, so every surface form of one person collapses to ONE identity and their facts attach to them (not lost). e.g. in a scene naming "Amír Aslán Khán": "the governor of Zanján = Amír Aslán Khán", "the arrogant governor = Amír Aslán Khán". Resolve such a reference ONLY when the scene ties it to a specific named person; a role/relationship pointing OUTSIDE the scene (e.g. "the maternal uncle of the Báb" with no uncle named here) → keep as written + "?" (reconcile resolves it by the connection).

BOOK:
${bookMeta}${cast ? `\n\nCAST (who's-who — resolve a bare/variant name to the right principal even if introduced elsewhere; honour each "≠ (not to be confused with)" distinction; a bare name = the most-prominent match UNLESS the passage's role/place/era fits a listed alternative):\n${cast}` : ''}`;
}

export function buildUser(p, { place, era, known }) {
  const scene = p.chapter ? `${p.chapter}${p.chapterTitle ? ' · ' + p.chapterTitle : ''}${p.scene ? ' · ' + p.scene : ''}` : (p.heading || '');
  const state = `place=${place || '(open)'} · era=${era || '(open)'}${known.length ? ` · known: ${known.join('; ')}` : ''}`;
  return `SCENE: ${scene || '(none)'}\nSTATE (inherit place/era unless this paragraph moves): ${state}\n\nPARAGRAPH [${p.pid}]:\n${p.text}`;
}
