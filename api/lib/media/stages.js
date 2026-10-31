// THE MEDIA STAGE REGISTRY (Chad 10-31: "the task checklist easily extensible … add new tasks along the way and reprocess just that task").
// One declaration per stage; STAGES, COMPLETE_STAGES, DEPENDENTS, TYPE_STAGES, the feed's stages and every fp derive from it.
// Pure (worker bundle imports it via item.js): no server imports. How to add a stage: docs/architecture/media-stages.md.
import { createHash } from 'node:crypto';
import { MODEL_ROLES } from '../model-roles.js';
import { QUIET_REPAIR_VERSION } from './quiet-record.js';

/** The job type = the bundle a stage is delivered in (planning/stage-queue-20261031.md §2; the audio bundles are scripts/media/worker/job-types.json). */
export const JOB_TYPES = ['intake', 'cpu-prep', 'gpu', 'cpu-finish', 'text', 'publish'];
export const AUDIO_JOBS = ['intake', 'cpu-prep', 'gpu', 'cpu-finish'];

/** RESOURCE CLASS (Chad 10-31) — every stage declares one; routing, the tower guard and concurrency derive from it. The ONE place for per-class settings.
 *   gpu  processor-heavy on a GPU      → pods / Aorus. Never tower (WorkerWait).
 *   cpu  processor-heavy on cores      → Boss / Aorus spill. Never tower (WorkerWait).
 *   llm  service-bound (LLM, external API, light bookkeeping): mostly waiting → an async pool on tower or any host; bounded by the provider's
 *        rate and cost, not by cores. */
const envN = (k, d) => (Number(process.env[k]) > 0 ? Number(process.env[k]) : d);
export const CLASSES = {
  gpu: { tower: false, hosts: ['pod', 'aorus'], get concurrency() { return envN('MEDIA_GPU_CONCURRENCY', 2); } },
  cpu: { tower: false, hosts: ['boss', 'aorus'], get concurrency() { return envN('MEDIA_STAGE_DEPTH', 2); } },
  llm: { tower: true, hosts: ['tower', 'any'], get concurrency() { return envN('MEDIA_LLM_CONCURRENCY', 12); }, get rpm() { return envN('MEDIA_LLM_RPM', 120); } },
};
/** WORKER PROFILES (Chad 10-31: "Workers are either GPU, CPU+LLM, or LLM") → the classes each takes. The orchestrator gives a job to a worker
 *  whose profile takes the job's class. gpu = pods, Aorus's GPU · cpu+llm = Boss, Aorus's spare cores · llm = tower, anywhere.
 *  Mirrored in scripts/media/worker/job-types.json `profiles` (the agent reads it there); a test keeps the two equal. */
export const PROFILES = { gpu: ['gpu'], 'cpu+llm': ['cpu', 'llm'], llm: ['llm'] };
/** A class → the profiles that take it. Pure. */
export const profilesFor = (cls) => Object.keys(PROFILES).filter((p) => PROFILES[p].includes(cls));
/** A profile → the job types it takes (job class ∈ the profile's classes), in JOB_TYPES order. Pure. */
export const profileJobs = (profile, reg) => {
  if (!PROFILES[profile]) throw Error(`unknown worker profile ${profile} (${Object.keys(PROFILES).join(' | ')})`);
  return JOB_TYPES.filter((t) => PROFILES[profile].includes((reg || REG).JOB_CLASS[t]));
};

/** A new stage may leave out `job`: its class picks the bundle. */
const DEFAULT_JOB = { gpu: 'gpu', cpu: 'cpu-finish', llm: 'text' };

const stable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`) : JSON.stringify(v ?? null));
/** fp = short hash of tool + settings (key order does not matter). Pure. */
export const fpOf = (tool, settings = {}) => createHash('sha256').update(`${tool}|${stable(settings)}`).digest('hex').slice(0, 12);

const llm = (role) => ({ tool: `llm:${role}`, settings: { model: MODEL_ROLES[role]?.model ?? null } });
const cleanRole = () => process.env.MEDIA_CLEAN_ROLE || 'media-clean-strong';

/**
 * The checklist, in run order. A stage declares:
 *   name · class (gpu | cpu | llm, REQUIRED: where it may run, CLASSES) · job (the bundle; default from class) · after (stages whose output it is made from: redoing one un-ticks this; must come earlier; a text/publish stage is never
 *   the parent of an audio stage) · tool + settings (what does it today; fp = hash of both, recorded on every tick) · required (a talk lacking it is
 *   incomplete; default true) · blocksAir (a talk LACKING it is off air; default false — a stage opts in) · feed (true = the media feed completes it
 *   on every published talk lacking it — opting in IS the approval of that spend; default false: such a stage is done only by a re-run campaign, which feeds
 *   exactly the talks it marked) · run (optional `async (ctx) => rec`, ctx = { item, meta, dir, d, rec, stop }; the built-in
 *   stages are the branches of runItem in item.js) · infer (optional (meta) => { tool, settings } | null: backfills the record of a stage ticked
 *   before records existed, from what meta already knows).
 */
export const STAGE_DEFS = [
  { name: 'archive', class: 'llm', job: 'intake', tool: 'archive', settings: {}, required: false },
  { name: 'grade', class: 'cpu', job: 'cpu-prep', tool: 'grade', settings: {}, required: false },
  { name: 'enhance', class: 'gpu', job: 'gpu', tool: 'enhance', settings: {}, required: false },
  { name: 'remaster', class: 'cpu', job: 'cpu-finish', tool: 'unipase', settings: {}, blocksAir: true,
    infer: (m) => (m.enhancement?.listening === 'unipase' || (m.enhancement?.variants || []).some((v) => v?.name === 'unipase') ? { tool: 'unipase', settings: {} } : null) },
  { name: 'verify', class: 'cpu', job: 'cpu-finish', after: ['remaster'], tool: 'remaster-audit', settings: {}, blocksAir: true },
  { name: 'realign', class: 'cpu', job: 'cpu-finish', after: ['remaster'], tool: 'media_tool:realign', settings: {}, required: false },
  { name: 'quiet', class: 'cpu', job: 'cpu-finish', after: ['remaster', 'realign'], tool: 'quiet.py', settings: { v: QUIET_REPAIR_VERSION }, blocksAir: true, feed: true,
    infer: (m) => (m.remaster?.quiet?.v != null ? { tool: m.remaster.quiet.tool || 'quiet.py', settings: { v: m.remaster.quiet.v } } : null) },
  { name: 'web', class: 'cpu', job: 'cpu-finish', after: ['quiet'], tool: 'ffmpeg:web', settings: {}, required: false },
  { name: 'transcribe', class: 'gpu', job: 'gpu', tool: 'asr', settings: {}, blocksAir: true },
  { name: 'preview', class: 'llm', job: 'text', tool: 'preview', settings: {}, required: false },
  { name: 'diarize', class: 'gpu', job: 'gpu', tool: 'diarize', settings: {}, blocksAir: true },
  { name: 'trim', class: 'cpu', job: 'cpu-finish', after: ['quiet'], tool: 'trim', settings: {}, required: false },
  { name: 'correct', class: 'llm', job: 'text', ...llm('media-correct'), blocksAir: true },
  { name: 'clean', class: 'llm', job: 'text', get tool() { return `llm:${cleanRole()}`; }, get settings() { return { model: MODEL_ROLES[cleanRole()]?.model ?? null }; }, required: false },
  { name: 'describe', class: 'llm', job: 'text', ...llm('media-meta'), required: false },
  { name: 'thumb', class: 'llm', job: 'publish', tool: 'thumb', settings: {}, required: false },
  { name: 'render', class: 'llm', job: 'publish', tool: 'render', settings: {}, required: false },
  { name: 'ingest', class: 'llm', job: 'publish', tool: 'ingest', settings: {}, blocksAir: true },
  { name: 'catalog', class: 'llm', job: 'publish', tool: 'catalog', settings: {}, blocksAir: true },
  { name: 'headings', class: 'llm', job: 'text', ...llm('media-headings'), blocksAir: true },
  { name: 'quotes', class: 'llm', job: 'text', ...llm('media-quotes'), blocksAir: true },
  { name: 'links', class: 'llm', job: 'text', tool: 'links', settings: {}, blocksAir: true },
  { name: 'assess', class: 'llm', job: 'text', ...llm('media-assess'), blocksAir: true },
  { name: 'update', class: 'llm', job: 'publish', after: ['quiet'], tool: 'update', settings: {}, required: false },
];

/** defs → the registry every caller derives from. Throws on an unknown job, an unknown/later parent, or a text stage feeding an audio stage. Pure. */
export function buildRegistry(defs = STAGE_DEFS) {
  const order = new Map(defs.map((d, i) => [d.name, i]));
  if (order.size !== defs.length) throw Error('stage registry: duplicate stage name');
  const BY = {};
  defs = defs.map((d) => (d.job || !CLASSES[d.class] ? d : Object.defineProperties({ job: DEFAULT_JOB[d.class] }, Object.getOwnPropertyDescriptors(d))));
  for (const d of defs) {
    if (!CLASSES[d.class]) throw Error(`stage ${d.name}: class ${d.class} is not one of ${Object.keys(CLASSES).join(', ')}`);
    if (!JOB_TYPES.includes(d.job)) throw Error(`stage ${d.name}: job ${d.job} is not one of ${JOB_TYPES.join(', ')}`);
    for (const p of d.after || []) {
      if (!order.has(p)) throw Error(`stage ${d.name}: after ${p}, which is not a stage`);
      if (order.get(p) > order.get(d.name)) throw Error(`stage ${d.name}: after ${p}, which runs later`);
      const pj = defs[order.get(p)].job;
      if (AUDIO_JOBS.includes(d.job) && !AUDIO_JOBS.includes(pj)) throw Error(`stage ${d.name}: an audio stage cannot depend on the ${pj} stage ${p} (a text fix never re-does audio)`);
    }
    BY[d.name] = { required: true, blocksAir: false, feed: false, after: [], ...d, get fp() { return fpOf(this.tool, this.settings); } };
    Object.defineProperty(BY[d.name], 'tool', Object.getOwnPropertyDescriptor(d, 'tool'));
    Object.defineProperty(BY[d.name], 'settings', Object.getOwnPropertyDescriptor(d, 'settings'));
  }
  const STAGES = defs.map((d) => d.name);
  const DEPENDENTS = {};
  for (const s of STAGES) for (const p of BY[s].after) (DEPENDENTS[p] ||= []).push(s);
  const TYPE_STAGES = Object.fromEntries(JOB_TYPES.map((t) => [t, STAGES.filter((s) => BY[s].job === t)]));
  // a bundle runs on ONE kind of host: its class is its stages' class, and it never mixes them
  const JOB_CLASS = {};
  for (const [t, ss] of Object.entries(TYPE_STAGES)) {
    const cs = [...new Set(ss.map((s) => BY[s].class))];
    if (cs.length > 1) throw Error(`job ${t} mixes classes ${cs.join(' + ')} (${ss.map((s) => `${s}:${BY[s].class}`).join(', ')})`);
    JOB_CLASS[t] = cs[0] || null;
  }
  return {
    BY, STAGES, DEPENDENTS, TYPE_STAGES, JOB_CLASS,
    COMPLETE_STAGES: STAGES.filter((s) => BY[s].required),
    AIR_STAGES: STAGES.filter((s) => BY[s].required && BY[s].blocksAir),
    FEED_STAGES: STAGES.filter((s) => BY[s].feed),
    AUDIO_STAGES: STAGES.filter((s) => AUDIO_JOBS.includes(BY[s].job)),
  };
}

export const REG = buildRegistry();
export const { STAGES, COMPLETE_STAGES, DEPENDENTS, TYPE_STAGES, AIR_STAGES, FEED_STAGES, JOB_CLASS } = REG;

/** May tower run this stage's work itself? Only the llm class (service-bound); gpu/cpu wait for a worker. Pure. */
export const towerMay = (stage, reg = REG) => !!CLASSES[reg.BY[stage]?.class]?.tower;
/** How many of a stage the feed keeps in flight: its class's concurrency. */
export const feedDepth = (stage, reg = REG) => CLASSES[reg.BY[stage]?.class]?.concurrency ?? 2;

/** The stages plus everything made from them (DEPENDENTS, transitively), in run order. Pure. */
export function withDependents(stages = [], reg = REG) {
  const out = new Set();
  const add = (s) => { if (out.has(s)) return; out.add(s); (reg.DEPENDENTS[s] || []).forEach(add); };
  stages.forEach(add);
  return [...out].sort((a, b) => reg.STAGES.indexOf(a) - reg.STAGES.indexOf(b)).filter((s) => reg.STAGES.includes(s)).concat([...out].filter((s) => !reg.STAGES.includes(s)));
}

/** What a re-run of `stage` re-does: it and its dependents, plus `update` on a published talk (re-render, re-ingest). Never an earlier stage. Pure. */
export const rerunSet = (stage, { published = false } = {}, reg = REG) => {
  const s = withDependents([stage], reg);
  return published && reg.BY.update && !s.includes('update') ? [...s, 'update'] : s;
};

/** The record a tick carries: { tool, settings, fp } — the stage's own report (rec.tool / rec.settings) or else the registry's current one. Pure. */
export function recordFor(stage, rec = {}, reg = REG) {
  const def = reg.BY[stage];
  const tool = rec.tool ?? def?.tool ?? stage, settings = rec.settings ?? def?.settings ?? {};
  return { tool, settings, fp: fpOf(tool, settings) };
}

/** Backfill: ticked stages without a record get one from what meta knows (the stage's own tool field, or the def's infer). Unknown stays
 *  unrecorded (no fp): a re-run with `fp!=current` includes it. Mutates and returns meta.stages. Pure otherwise. */
export function withRecords(meta = {}, reg = REG) {
  const st = (meta.stages ||= {});
  for (const [s, r] of Object.entries(st)) {
    if (!r?.at || r.fp) continue;
    const got = r.tool ? { tool: r.tool, settings: r.settings || {} } : reg.BY[s]?.infer?.(meta) || null;
    if (got) st[s] = { ...r, tool: got.tool, settings: got.settings, fp: fpOf(got.tool, got.settings), backfilled: true };
  }
  return st;
}

/** Recorded fp ≠ the registry's current fp (or no record): what `--where fp!=current` selects. Pure. */
export const isStale = (meta, s, reg = REG) => !!meta.stages?.[s]?.at && meta.stages[s].fp !== reg.BY[s]?.fp;

/** Done for the checklist: ticked and not marked stale by a re-run. */
export const ticked = (meta, s) => !!meta.stages?.[s]?.at && !meta.stages[s].stale;

/** Mark a re-run on one talk: the stage + rerunSet keep their `at` (the talk stays on air on its current files) and get `stale`; the run
 *  re-does exactly those. Never an earlier stage. Mutates meta; → the stages marked. Pure otherwise. */
export function markStale(meta, stage, { published = false, campaign = null, at = new Date().toISOString() } = {}, reg = REG) {
  const out = [];
  for (const s of rerunSet(stage, { published }, reg)) if (meta.stages?.[s]?.at) { meta.stages[s] = { ...meta.stages[s], stale: { at, campaign } }; out.push(s); }
  return out;
}

/** The required stages a talk still needs (missing, or stale for a re-run — any stale stage counts, required or not), in run order. */
export function missingStages(meta = {}, ok = ticked, reg = REG) {
  return reg.STAGES.filter((s) => (reg.BY[s].required && !ok(meta, s)) || (meta.stages?.[s]?.at && meta.stages[s].stale));
}

/** The registry as the ops API shows it. */
export const describeRegistry = (reg = REG) => reg.STAGES.map((s) => { const d = reg.BY[s]; return { name: s, class: d.class, job: d.job, after: d.after, tool: d.tool, settings: d.settings, fp: d.fp, required: d.required, blocksAir: d.blocksAir, feed: d.feed }; });
