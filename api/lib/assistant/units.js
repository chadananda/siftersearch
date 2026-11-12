// Context UNITS (planning/anis-strategy-trees.md §2a/§2b): the named registry, layer resolution (turn > conversation > reader > site > default),
// and the conversation_state object as a fold of patches (Jev patches beside the strategy choice, code appends at tree end). Pure; storage is
// repos/conversation-state-repo.js. Deps: tradition-name (canonical traditions).
import { canonicalTradition } from './tradition-name.js';

// [name, type, filled-by, default, carried-to-next-turn: conversation | reader | site | null]
const ROWS = [
  ['current_user_question', 'text', 'code', null, null], ['previous_conversation_rounds', 'rounds', 'code', [], null], ['previous_answer', 'answer', 'code', null, null],
  ['previous_evidence', 'evidence', 'code', {}, null], ['previous_scope', 'scope', 'code', null, null], ['referent', 'items', 'jev+code', null, null], ['reader_position', 'position', 'code', null, null],
  ['reader_card', 'card', 'code', { reads_scripts: [] }, 'reader'], ['host_site', 'site', 'code', null, 'site'], ['locale', 'country', 'code', 'international', 'reader'], ['channel', 'enum', 'code', 'widget-chat', null],
  ['reply_language', 'lang', 'jev', null, 'conversation'], ['depth', 'enum', 'jev', 'brief', null], ['reply_budget', 'budget', 'code', null, null], ['reading_plan', 'plan', 'code', null, 'reader'],
  ['religions_specified', 'traditions', 'jev', 'all', 'conversation'], ['scope_source', 'enum', 'code', 'default', null], ['authority_floor', 'enum', 'jev', 'interpretation', 'conversation'],
  ['named_sources', 'ids', 'jev+code', [], null], ['search_originals', 'bool', 'jev', true, 'conversation'], ['scope_excluded', 'count', 'elements', 0, null],
  ['reads_scripts', 'scripts', 'jev', [], 'conversation'],
  ['topic', 'text', 'jev', null, 'conversation'], ['question_frame', 'enum', 'jev', 'what', null], ['quoted_words', 'text', 'jev+code', null, null], ['quoted_clean', 'text', 'jev', null, null],
  ['last_topic', 'text', 'code', null, null], ['last_passages', 'items', 'code', [], null], ['refers_back', 'bool', 'code', false, null], ['follows_topic', 'text', 'code', null, null], ['side_sources', 'map', 'code', {}, null],
  ['incipit', 'text', 'jev', null, null], ['named_person', 'id', 'jev+code', null, 'conversation'], ['named_work', 'id', 'jev+code', null, 'conversation'], ['translation_wanted', 'id', 'jev+code', 'authorized', null],
  ['parallel_direction', 'enum', 'jev', 'to_original', null], ['work_place', 'enum', 'jev', null, null], ['target_lang', 'lang', 'jev', null, null], ['scripture_reference', 'ref', 'code', null, null], ['term', 'word', 'jev', null, 'conversation'],
  ['fact_asked', 'enum', 'jev', null, null], ['occasion', 'text', 'jev', null, null], ['compare_sides', 'list', 'jev', null, null], ['named_subjects', 'list', 'jev', null, null], ['audience', 'enum', 'jev', null, 'conversation'],
  ['output_form', 'enum', 'jev', null, null], ['amount_wanted', 'amount', 'jev', null, null], ['delivery', 'enum', 'jev', 'here', null], ['challenged_claim', 'text', 'jev', null, null],
  ['challenge_kind', 'enum', 'jev', 'support', null], ['contested', 'bool', 'jev', false, null], ['about_what', 'enum', 'jev', 'library', null], ['plan_action', 'enum', 'jev', null, null],
  ['reader_state', 'enum', 'jev', 'curious', 'conversation'], ['institution', 'text', 'code', 'a qualified teacher of your tradition', null],
  ['found_passages', 'passages', 'elements', [], null], ['found_records', 'records', 'elements', [], null], ['web_found', 'web', 'elements', [], null], ['found_outcome', 'map', 'elements', {}, null],
  ['path', 'list', 'engine', [], null], ['sub_themes', 'list', 'elements', null, null], ['criteria', 'list', 'elements', null, null], ['entries', 'list', 'elements', null, null], ['phrasings', 'list', 'elements', null, null], ['histories', 'list', 'elements', null, null],
  ['criterion_verdicts', 'list', 'elements', null, null], ['undated_entries', 'list', 'elements', null, null], ['widened', 'obj', 'elements', null, null], ['missing', 'list', 'elements', [], null],
];
export const UNITS = Object.freeze(Object.fromEntries(ROWS.map(([name, type, filled, def, carried]) => [name, Object.freeze({ name, type, filled, default: def, carried })])));
const ALWAYS_JEV = ['religions_specified', 'authority_floor', 'search_originals', 'reply_language', 'depth', 'reads_scripts', 'reader_state', 'audience'];
/** Units a strategy asks Jev for (request units: Jev-filled, outside the always-present scope/reader set). */
export const isRequestUnit = (name) => !!UNITS[name]?.filled.startsWith('jev') && !ALWAYS_JEV.includes(name);
export const LAYERS = Object.freeze(['turn', 'conversation', 'reader', 'site']);
const empty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** The nearest layer holding the unit: { value, layer } (layer 'default' with the registry default when no layer has it). Pure. */
export function resolveUnit(name, layers = {}) {
  for (const layer of LAYERS) { const v = layers[layer]?.[name]; if (!empty(v)) return { value: v, layer }; }
  const d = UNITS[name]?.default;
  return { value: d && typeof d === 'object' ? structuredClone(d) : d ?? null, layer: 'default' };
}

// ── conversation_state ──────────────────────────────────────────────────────────────────────────────────────────────────
export const emptyState = () => ({ scope: {}, reader: {}, subjects: {}, thread: [], given: [], offers: [], open: [], version: 0, updated_turn: null });
const CAP = { thread: 12, given: 80, offers: 6, open: 8 };
const ENUM = { authority_floor: ['scripture', 'interpretation', 'any'], audience: ['children', 'mixed', 'study circle', 'seeker', 'scholar'], reader_state: ['curious', 'hostile', 'grieving', 'in crisis', 'ready to join'] };
const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const traditions = (v) => {
  if (v === 'all') return 'all';
  if (!Array.isArray(v)) return undefined;
  const t = [...new Set(v.map((x) => canonicalTradition(String(x))).filter(Boolean))].slice(0, 6);
  return t.length ? t : undefined;
};
const FIELDS = {
  scope: { religions_specified: traditions, authority_floor: (v) => (ENUM.authority_floor.includes(v) ? v : undefined), search_originals: (v) => (typeof v === 'boolean' ? v : undefined) },
  reader: { reply_language: (v) => (/^[a-z]{2,3}$/.test(v) ? v : undefined), audience: (v) => (ENUM.audience.includes(v) ? v : undefined), reader_state: (v) => (ENUM.reader_state.includes(v) ? v : undefined),
    reads_scripts: (v) => { const a = Array.isArray(v) ? [...new Set(v.filter((x) => /^[a-z]{3,12}$/.test(x)))].slice(0, 6) : []; return a.length ? a : undefined; } },
  subjects: { topic: (v) => str(v, 200) ?? undefined, named_person: (v) => (typeof v === 'number' ? v : str(v, 80) ?? undefined), named_work: (v) => (typeof v === 'number' ? v : str(v, 80) ?? undefined), term: (v) => str(v, 80) ?? undefined },
};
const KINDS = ['passage', 'title', 'record'];
const smallUnits = (x) => { if (!x || typeof x !== 'object') return {}; try { const j = JSON.stringify(x); return j.length <= 1500 ? JSON.parse(j) : {}; } catch { return {}; } };
const ENTRY = {
  thread: (e) => (Number.isFinite(e?.turn) ? { turn: e.turn, strategy: str(e.strategy, 60), topic: str(e.topic, 200), output_form: str(e.output_form, 40), found_outcome: str(e.found_outcome, 20) } : null),
  given: (e) => (Number.isFinite(e?.turn) && KINDS.includes(e.kind) && e.ref != null ? { turn: e.turn, kind: e.kind, ref: String(e.ref).slice(0, 120) } : null),
  offers: (e) => (Number.isFinite(e?.turn) && str(e.what, 200) ? { what: str(e.what, 200), turn: e.turn, strategy: str(e.strategy, 60), units: smallUnits(e.units), ...(e.channel ? { channel: str(e.channel, 30) } : {}) } : null),
  open: (e) => str(e, 200),
};
// who may write what: Jev patches the settings and closes offers/open items; code appends what the tree found
const ALLOWED = { jev: ['scope', 'reader', 'subjects', 'offers_drop', 'open_clear'], code: ['subjects', 'thread', 'given', 'offers', 'open', 'open_clear', 'offers_drop'] };

/** Schema-validate a raw patch: unknown keys/fields dropped, values coerced or dropped. → clean patch (maybe {}). Pure. */
export function sanitizePatch(raw, by = 'jev') {
  const out = {}, ok = ALLOWED[by] || [];
  if (!raw || typeof raw !== 'object') return out;
  for (const grp of ['scope', 'reader', 'subjects']) {
    if (!ok.includes(grp) || !raw[grp] || typeof raw[grp] !== 'object') continue;
    const g = {};
    for (const [k, fn] of Object.entries(FIELDS[grp])) if (k in raw[grp]) { let v; try { v = fn(raw[grp][k]); } catch { v = undefined; } if (v !== undefined && v !== null) g[k] = v; }
    if (Object.keys(g).length) out[grp] = g;
  }
  for (const [k, fn] of Object.entries(ENTRY)) {
    if (!ok.includes(k) || !Array.isArray(raw[k])) continue;
    let items; try { items = raw[k].map(fn).filter(Boolean); } catch { items = []; }
    if (items.length) out[k] = items;
  }
  if (ok.includes('offers_drop') && (raw.offers_drop === 'all' || Array.isArray(raw.offers_drop))) out.offers_drop = raw.offers_drop === 'all' ? 'all' : raw.offers_drop.filter(Number.isInteger).slice(0, 6);
  if (ok.includes('open_clear') && Array.isArray(raw.open_clear)) { const c = raw.open_clear.map((x) => str(x, 200)).filter(Boolean); if (c.length) out.open_clear = c; }
  return out;
}

/** state + one (clean) patch at `turn` → the next state. Offers lapse after 2 turns or when the topic changes. Pure. */
export function applyPatch(state = emptyState(), patch = {}, { turn = null } = {}) {
  const s = { ...emptyState(), ...state, scope: { ...state.scope }, reader: { ...state.reader }, subjects: { ...state.subjects } };
  for (const grp of ['scope', 'reader', 'subjects']) Object.assign(s[grp], patch[grp] || {});
  s.thread = [...(state.thread || []), ...(patch.thread || [])].slice(-CAP.thread);
  s.given = [...(state.given || []), ...(patch.given || [])].slice(-CAP.given);
  let offers = [...(state.offers || [])];
  if (patch.offers_drop === 'all') offers = []; else if (Array.isArray(patch.offers_drop)) offers = offers.filter((_, i) => !patch.offers_drop.includes(i));
  if (patch.subjects?.topic && state.subjects?.topic && patch.subjects.topic !== state.subjects.topic) offers = [];
  offers = [...offers, ...(patch.offers || [])];
  if (turn != null) offers = offers.filter((o) => turn - o.turn <= 2);
  s.offers = offers.slice(-CAP.offers);
  s.open = [...new Set([...(state.open || []).filter((q) => !(patch.open_clear || []).includes(q)), ...(patch.open || [])])].slice(-CAP.open);
  s.version = (state.version || 0) + 1; s.updated_turn = turn ?? state.updated_turn ?? null;
  return s;
}
/** Fold stored patches [{turn, patch}] (oldest first) into the state. An old conversation without rows = the empty state. Pure. */
export const foldPatches = (rows = []) => rows.reduce((s, r) => applyPatch(s, r.patch || {}, { turn: r.turn }), emptyState());

// ── layers → scope and units ────────────────────────────────────────────────────────────────────────────────────────────
const SCOPE_UNITS = ['religions_specified', 'authority_floor', 'search_originals'];
/** The state's carried fields as the conversation layer. */
export const conversationLayer = (st = emptyState()) => ({ ...st.scope, ...st.reader, ...st.subjects });
/** The reader card's data as the reader layer: its language and the scripts it holds (memory kind 'reads_script'). Never written by the state. */
export const readerLayer = (data = {}) => ({ ...(data.language ? { reply_language: data.language } : {}), reads_scripts: (data.memory || []).filter((m) => m?.kind === 'reads_script' && !m.corrected).map((m) => String(m.content).toLowerCase()).filter(Boolean) });
/** The host profile as the site layer. */
export const siteLayer = (profile = {}) => (profile.default_tradition ? { religions_specified: [canonicalTradition(profile.default_tradition)] } : {});

/** Resolve the scope units through the layers. → { units: {religions_specified, authority_floor, search_originals, reads_scripts, reply_language, scope_source}, sources: {unit: layer}, religion } */
export function resolveScope(layers) {
  const units = {}, sources = {};
  for (const n of [...SCOPE_UNITS, 'reads_scripts', 'reply_language']) { const r = resolveUnit(n, layers); units[n] = r.value; sources[n] = r.layer; }
  units.scope_source = sources.religions_specified;
  return { units, sources, religion: Array.isArray(units.religions_specified) && units.religions_specified.length === 1 ? units.religions_specified[0] : null };
}

const pairs = (messages = []) => {
  const out = [], m = messages.slice(0, -1);
  for (let i = 0; i < m.length; i++) if (m[i].role === 'user') out.push({ user: String(m[i].content || '').slice(0, 400), reply: m[i + 1]?.role === 'assistant' ? String(m[i + 1].content || '').slice(0, 600) : '' });
  return out.slice(-6);
};
/** The passages the LAST turn cited, from the state's given refs ("doc:paragraph") → [{ref, document_id, paragraph_index}]. Pure. */
export function lastPassages(state = emptyState()) {
  const g = (state.given || []).filter((x) => x.kind === 'passage');
  if (!g.length) return [];
  const t = Math.max(...g.map((x) => x.turn));
  return g.filter((x) => x.turn === t).map((x) => { const [d, p] = String(x.ref).split(':'); return d !== '' && p != null && p !== '' && Number.isFinite(Number(d)) && Number.isFinite(Number(p)) ? { ref: x.ref, document_id: Number(d), paragraph_index: Number(p) } : null; }).filter(Boolean);
}
/** The subject of the last turn: the state's thread entry, else the previous user message. Pure. */
export const lastTopic = (state = emptyState(), messages = []) => state.thread?.at(-1)?.topic ?? messages.filter((m) => m.role === 'user').slice(0, -1).at(-1)?.content?.slice(0, 300) ?? null;

/**
 * The units object a tree runs on (s.units). Code-filled units always; scope through the layers; request units (Jev's, `request`) only when the
 * strategy declares them in `needs` (null needs = none). previous_* come from the last turns. Pure.
 */
export function buildUnits({ question = '', messages = [], state = emptyState(), turnLayer = {}, reader = {}, profile = {}, needs = null, request = {}, channel = null, depth = null, previous = null } = {}) {
  const layers = { turn: turnLayer, conversation: conversationLayer(state), reader, site: siteLayer(profile) };
  const { units, sources } = resolveScope(layers);
  const u = { ...units, current_user_question: question, previous_conversation_rounds: pairs(messages), previous_scope: state.scope && Object.keys(state.scope).length ? { ...state.scope } : null, scope_sources: sources };
  if (previous) Object.assign(u, { previous_answer: previous.answer ?? null, previous_evidence: previous.evidence ?? {} });
  if (channel) u.channel = channel;
  if (depth) u.depth = depth;
  for (const n of ['audience', 'reader_state', 'topic', 'named_person', 'named_work', 'term']) { const r = resolveUnit(n, layers); if (r.layer !== 'default' || UNITS[n].default != null) u[n] = r.value; }
  const given = state.given || [];
  u.referent = given.length ? [given[given.length - 1]] : null;
  u.last_topic = lastTopic(state, messages); u.last_passages = lastPassages(state);
  for (const n of needs || []) if (isRequestUnit(n) && request[n] != null) u[n] = request[n];
  return u;
}

// ── Jev's patch, asked in the ONE strategy-choice call (typed choices only: System One has no free text) ───────────────────
export const LANGS = { en: 'English', ar: 'Arabic', fa: 'Persian', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', tr: 'Turkish', he: 'Hebrew', it: 'Italian' };
export const SCRIPTS = { none: 'the reader says nothing about reading Arabic, Persian or Hebrew script', arabic: 'the reader writes in Arabic script or says they read Arabic', persian: 'the reader writes in Persian script or says they read Persian', hebrew: 'the reader writes in Hebrew script or says they read Hebrew' };
export const liveOffers = (st, turn) => (st.offers || []).filter((o) => turn == null || turn - o.turn <= 2);
/** The compact state Jev reads beside the thread. Pure. */
export function stateText(st = emptyState(), turn = null) {
  const bits = [], sc = st.scope || {};
  if (sc.religions_specified) bits.push(`scope: ${sc.religions_specified === 'all' ? 'every tradition' : sc.religions_specified.join(', ')}`);
  if (sc.authority_floor) bits.push(`authority: ${sc.authority_floor}`);
  if (st.reader?.reply_language) bits.push(`reply language: ${st.reader.reply_language}`);
  if (st.subjects?.topic) bits.push(`subject: ${st.subjects.topic}`);
  const last = st.thread?.at(-1);
  if (last) bits.push(`last turn: ${last.strategy || 'unknown'}${last.topic ? ` on "${last.topic}"` : ''} (${last.found_outcome || '?'})`);
  const offers = liveOffers(st, turn);
  if (offers.length) bits.push(`open offers: ${offers.map((o) => o.what).join(' | ')}`);
  if (st.open?.length) bits.push(`unanswered: ${st.open.join(' | ')}`);
  return bits.length ? `conversation state: ${bits.join('; ')}` : '';
}
/** The extra typed questions riding in the strategy call. `traditions` = {name: description}. Pure. */
export function patchQuestions(st = emptyState(), traditions = {}, turn = null) {
  const t = Object.fromEntries(Object.entries(traditions).filter(([k]) => k !== 'none'));
  const q = {
    scope_religion: { type: 'choice', instructions: 'Does the latest message set or change which religion(s) this conversation is about ("only Buddhism", "what about in Islam?", "in every tradition")? "unchanged" when it does not.', criteria: { unchanged: 'no change to the religion in scope', all: 'every tradition / the whole library', ...t } },
    scope_span: { type: 'choice', instructions: 'If the message changes the religion in scope: does it hold for the rest of the conversation, or only for this one message?', criteria: { conversation: 'for the rest of the conversation', turn: 'this message only' } },
    authority_floor: { type: 'choice', instructions: 'Does the latest message limit the kind of sources wanted?', criteria: { unchanged: 'no change', scripture: 'scripture only', interpretation: 'scripture and authorized interpretation', any: 'any kind of source' } },
    reply_language: { type: 'choice', instructions: 'Does the reader ask for the reply in a particular language, or has the reader switched to writing in one?', criteria: { unchanged: 'no change', ...LANGS } },
    reads_script: { type: 'choice', instructions: 'Does the reader write in, or say they read, Arabic, Persian or Hebrew script? One Arabic proper name inside an English question is NOT evidence.', criteria: SCRIPTS },
  };
  if (st.thread?.length) q.continues = { type: 'choice', instructions: 'Does the latest message continue the previous turn\'s request with one detail changed (another religion, another form, "the second one"), rather than start a new request?', criteria: { new: 'a new request', previous: 'the same request as the previous turn with a changed detail' } };
  if (liveOffers(st, turn).length) q.offer = { type: 'choice', instructions: 'The assistant made an offer last turn. Does the latest message accept it, decline it, or neither?', criteria: { none: 'neither', accepted: 'accepts the offer', declined: 'declines the offer' } };
  return q;
}
/** Jev's answers → { patch (persisted), turnOnly (this turn's layer only), continues, offer }. Below `min` confidence = unchanged. Schema-validated. Pure. */
export function patchFromAnswers(a = {}, { min = 0.6, st = emptyState() } = {}) {
  const pick = (k, bad = ['unchanged']) => { const x = a?.[k]; const c = x?.choice ?? x?.value; return x && c != null && !bad.includes(c) && (x.confidence ?? x.distribution?.[c] ?? 0) >= min ? c : null; };
  const raw = { scope: {}, reader: {} };
  const rel = pick('scope_religion'); if (rel) raw.scope.religions_specified = rel === 'all' ? 'all' : [rel];
  const fl = pick('authority_floor'); if (fl) raw.scope.authority_floor = fl;
  const lang = pick('reply_language'); if (lang) raw.reader.reply_language = lang;
  const sc = pick('reads_script', ['none']); if (sc) raw.reader.reads_scripts = [...new Set([...(st.reader?.reads_scripts || []), sc])];
  const clean = sanitizePatch(raw, 'jev');
  const turnOnly = pick('scope_span', []) === 'turn' && clean.scope?.religions_specified ? { scope: { religions_specified: clean.scope.religions_specified } } : null;
  if (turnOnly) { delete clean.scope.religions_specified; if (!Object.keys(clean.scope).length) delete clean.scope; }
  const offer = pick('offer', ['none']);
  if (offer) clean.offers_drop = 'all';
  return { patch: clean, turnOnly, continues: pick('continues', ['new']) === 'previous', offer };
}

// ── tree end: what code appends ─────────────────────────────────────────────────────────────────────────────────────────
const refOf = (p) => (p.document_id != null ? `${p.document_id}:${p.paragraph_index ?? ''}` : p.id ?? p.ref ?? null);
/**
 * After the tree ran: given (every passage/title/record quoted or listed), thread, open (thin/absent/unavailable/widened), offers, subjects.
 * `units` is the tree's final units; `ended` is thin|absence|unavailable|null. → clean code patch. Pure.
 */
export function treePatch({ turn, strategy = null, units: u = {}, ended = null, state = emptyState(), channel = null } = {}) {
  const isTitle = (p) => p.paragraph_index == null && !p.text && p.document_id != null;
  const given = [
    ...(u.found_passages || []).map((p) => ({ turn, kind: isTitle(p) ? 'title' : 'passage', ref: refOf(p) })),
    ...(u.found_records || []).map((r) => ({ turn, kind: r.kind === 'title' || r.type === 'work' ? 'title' : 'record', ref: r.id ?? r.ref ?? r.name ?? r.title })),
  ].filter((g) => g.ref != null && g.ref !== '');
  const seen = new Set((state.given || []).filter((g) => g.turn === turn).map((g) => `${g.kind}:${g.ref}`));
  const outcomes = Object.values(u.found_outcome || {});
  const found_outcome = ended ?? (outcomes.includes('several') ? 'several' : outcomes.includes('one') ? 'one' : outcomes.includes('thin') ? 'thin' : outcomes.length ? 'none' : given.length ? 'several' : null);
  const topic = u.topic || u.current_user_question || null;
  const unitsKeep = Object.fromEntries(['topic', 'religions_specified', 'output_form', 'named_person', 'named_work', 'term', 'authority_floor'].filter((k) => u[k] != null).map((k) => [k, u[k]]));
  return sanitizePatch({
    subjects: { topic: u.topic, named_person: u.named_person, named_work: u.named_work, term: u.term },
    thread: [{ turn, strategy, topic, output_form: u.output_form ?? null, found_outcome }],
    given: given.filter((g) => !seen.has(`${g.kind}:${g.ref}`)),
    offers: (u.offers || []).map((o) => ({ what: typeof o === 'string' ? o : o.what, turn, strategy, units: o.units ?? unitsKeep, ...(o.channel || channel ? { channel: o.channel || channel } : {}) })),
    open: (['thin', 'absence', 'unavailable'].includes(found_outcome) || u.widened) && topic ? [topic] : [],
    open_clear: ['one', 'several'].includes(found_outcome) && topic ? [topic] : [],
  }, 'code');
}
