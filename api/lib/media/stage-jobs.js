// Typed media jobs, TOWER side (planning/stage-queue-20261031.md §2-4): which job a talk needs next (pure nextJobs over the checklist),
// validating each typed result (contract, never splice, quiet before complete), the next job's body (inputs = the previous result's files),
// the feed order (priority is ORDER: new > remaster of published > re-run, 1 claim in 5 to the oldest lower band) and the per-talk split fraction
// (MEDIA_TYPED_FRACTION) so the whole path keeps working. Tower never runs the audio work. Contract override: scripts/media/worker/job-types.json.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REG, fpOf, JOB_TYPES as REG_JOB_TYPES } from './stages.js';
import { hasQuiet } from './quiet-record.js';

export const AUDIO_TYPES = ['cpu-prep', 'gpu', 'cpu-finish'];
export const JOB_TYPES = REG_JOB_TYPES;
/** The checklist stages each job type delivers (§2) — derived from the stage registry (stages.js: each stage's job / class). The tower run (runItem) ticks them when it takes the result; text/publish run on tower. */
export const TYPE_STAGES = REG.TYPE_STAGES;
const audioStages = (reg) => AUDIO_TYPES.flatMap((t) => reg.TYPE_STAGES[t]);
/** remaster statuses that stop audio work until Chad decides (held → /admin/media-held) or for good (archived) */
export const AUDIO_TERMINAL = ['review', 'archived', 'kept', 'deferred'];

/** The stages that really count as done: ticked, not marked stale, and everything they were made from done too (registry `after` edges). Pure. */
export function effectiveDone(stages = {}, reg = REG) {
  const memo = new Map();
  const ok = (s) => {
    if (memo.has(s)) return memo.get(s);
    memo.set(s, false);
    const v = !!stages[s]?.at && !stages[s]?.stale && (reg.BY[s]?.after || []).every(ok);
    memo.set(s, v); return v;
  };
  return new Set(reg.STAGES.filter(ok));
}

/** checklist = { stages, have: { prep, gpu, pure } (prep/gpu = a step result held for the CURRENT input; pure = false when a ticked remaster's
 *  pure UniPASE copy is gone), remaster_status } → the job types to run now. Pure.
 *  Re-derives any lost job: the answer depends only on the record. A text-only gap never yields an audio job. */
export function nextJobs({ stages = {}, have = {}, remaster_status = null } = {}, reg = REG) {
  const TYPE_STAGES = reg.TYPE_STAGES, AUDIO_STAGES = audioStages(reg);
  const done = effectiveDone(stages, reg), miss = (l) => l.filter((s) => !done.has(s));
  if (!done.has('archive')) return ['intake'];
  const out = [];
  if (miss(AUDIO_STAGES).length && !AUDIO_TERMINAL.includes(remaster_status)) {
    const needFinish = miss(TYPE_STAGES['cpu-finish']).length > 0;
    // §7: only missing stages + their dependents. A ticked remaster's PURE output is kept (tower / R2), so a talk missing only finish
    // stages (quiet, web, …) goes straight to cpu-finish; the gpu re-runs only when the remaster itself is missing or its output is gone.
    const needGpu = miss(TYPE_STAGES.gpu).length > 0 || (needFinish && !have.gpu && (!done.has('remaster') || have.pure === false));
    const needPrep = miss(TYPE_STAGES['cpu-prep']).length > 0 || (needGpu && !have.prep);
    out.push(needPrep ? 'cpu-prep' : needGpu ? 'gpu' : 'cpu-finish');
  }
  const heard = done.has('transcribe') && done.has('diarize');
  if (heard && miss(TYPE_STAGES.text).length) out.push('text');
  else if (heard && miss(TYPE_STAGES.publish).length && (!miss(AUDIO_STAGES).length || miss(TYPE_STAGES.publish).some((s) => s !== 'update'))) out.push('publish');
  return out;
}

/** meta (+ what tower holds) → the checklist nextJobs reads. The quiet record counts as the quiet stage (item.js stageOk). */
export function checklistOf(meta = {}, have = {}) {
  const stages = { ...(meta.stages || {}) };
  if (!stages.quiet?.at && (meta.remaster?.quiet?.v ?? 0) >= 1) stages.quiet = { at: meta.remaster.quiet.at || 1 };
  return { stages, have, remaster_status: meta.remaster?.status || null };
}
/** What a talk's typed chain holds: adopted step results still in the queue's results store (acked only when the chain ends). */
export const haveOf = (chain = {}) => ({ prep: !!chain['cpu-prep']?.adopted, gpu: !!chain.gpu?.adopted });

// ---- the contract (scripts/media/worker/job-types.json, B) ----
export { fpOf };   // fp = short hash of tool + settings (stages.js)
export const CONTRACT = JSON.parse(readFileSync(new URL('../../../scripts/media/worker/job-types.json', import.meta.url), 'utf8'));
/** The fixed outputs a type's result must list (templated / "…" entries are checked by whole-result.js at the end). */
export const requiredFiles = (type) => (CONTRACT.types[type]?.outputs?.files || []).filter((f) => !/[{…]/.test(f));
const SAFE_PATH = (p) => typeof p === 'string' && p && !p.includes('\\') && !p.startsWith('/') && !p.split('/').some((x) => !x || x === '.' || x === '..');
const NEED = { 'cpu-prep': { ram_gb: 4 }, gpu: { vram_mb: 12000, ram_gb: 8 }, 'cpu-finish': { ram_gb: 5 } };

/** A typed result.json against the contract and the talk it was for; throws the named reason. Never splice: a remaster that carries any
 *  original sentence is refused at every step. `outputs` = the names the agent uploaded (item/<path>). Pure. */
export function validateTyped(type, r, { inputSha, slug, outputs = null } = {}) {
  const why = (m) => { throw Error(`${type} result refused: ${m}`); };
  if (!r || r.v !== 1) why('not a v1 result.json');
  if (r.type !== type) why(`type ${r.type} ≠ ${type}`);
  if (Number(r.contract) !== Number(CONTRACT.contract)) why(`contract ${r.contract} ≠ ${CONTRACT.contract}: re-image the worker`);
  if (!r.ok) why(`worker failed: ${r.why || r.error || 'no reason'}`);
  if (inputSha && r.input_sha !== inputSha) why('made from a different original');
  if (slug && r.slug !== slug) why(`slug ${r.slug} ≠ ${slug}`);
  const files = r.files || [];
  for (const f of files) if (!SAFE_PATH(f.path) || f.path.startsWith('original/') || !/^[0-9a-f]{64}$/.test(f.sha256 || '')) why(`unsafe or unhashed output ${f.path}`);
  const have = new Set(files.map((f) => f.path)), lost = requiredFiles(type).filter((f) => !have.has(f));
  if (lost.length) why(`missing ${lost.join(', ')}`);
  if (outputs) { const up = new Set(outputs), gone = files.filter((f) => !up.has('item/' + f.path)).map((f) => f.path); if (gone.length) why(`listed but not uploaded: ${gone.slice(0, 5).join(', ')}`); }
  const rm = r.meta?.remaster || {};
  if ((rm.swapped || 0) > 0 || (rm.fallback_sent_pct || 0) > 0 || rm.verdict === 'spliced' || r.meta?.qa?.remaster?.verdict === 'spliced') why('original audio spliced into the remaster (never allowed)');
  if (type === 'cpu-finish' && !AUDIO_TERMINAL.includes(rm.status) && !hasQuiet(r.meta)) why('no quiet pass (a remaster without quiet is not complete)');
  return r;
}

/** The queue job for one typed step. cpu-prep carries tower's fresh meta (wholeJob); later steps take the previous result's files as inputs
 *  (results/<prev id>/item/<path>, sha256-checked by the worker). All steps share the original's staged file id. Pure. */
export function typedJob(type, { itemId, fileId, wj, prev = null, band = 0, audio_s = 0, bytes = 0 }) {
  const key = fpOf(type, { sha: wj.input_sha, prev: prev?.id || null });
  const job = { v: 1, type, contract: CONTRACT.contract, id: itemId, input: wj.input, input_sha: wj.input_sha, threads: wj.threads || 2, ...(type === 'cpu-prep' ? { meta: wj.meta } : {}) };
  // prev.staged: the step runs on the other transport, so tower copied the previous files into this queue's files/<file id>/item/**
  const inputs = (prev?.files || []).map((f) => ({ name: 'item/' + f.path, store: prev.staged ? 'files' : 'results', id: prev.staged ? fileId : prev.id, path: 'item/' + f.path, sha256: f.sha256 }));
  return { id: `${type}-${itemId}-${key}`, file_id: fileId, item_id: itemId, type, stages: [type], contract: CONTRACT.contract, band, priority: 0,
    invoice: { audio_s, bytes }, need: NEED[type], job, inputs };
}

/** Stamp the checklist's tool records (§1: { tool, settings, fp, host, job }) on the adopted meta from each step's result. Pure (returns meta). */
export function stampTools(meta, chain = {}) {
  for (const type of AUDIO_TYPES) {
    const step = chain[type];
    if (!step) continue;
    for (const s of TYPE_STAGES[type]) {
      if (!meta.stages?.[s]?.at) continue;
      const src = step.tools?.[s] || meta.stages[s] || {}, tool = src.tool || (s === 'quiet' ? meta.remaster?.quiet?.tool || 'quiet.py' : REG.BY[s]?.tool || `${type}:${s}`);
      const settings = src.settings || (s === 'quiet' && meta.remaster?.quiet ? { v: meta.remaster.quiet.v } : REG.BY[s]?.settings || {});
      meta.stages[s] = { ...meta.stages[s], tool, settings, fp: fpOf(tool, settings), host: step.host || null, job: step.id };
    }
  }
  return meta;
}
/** A step result → what the chain keeps: the stages its meta ticked ({at}) and any per-stage tool records it reported. Pure. */
export function stepOf(j, r, now = Date.now()) {
  const ticks = Object.fromEntries(Object.entries(r.meta?.stages || {}).filter(([, v]) => v?.at).map(([k, v]) => [k, { at: v.at }]));
  const tools = r.stages && !Array.isArray(r.stages) && typeof r.stages === 'object' ? r.stages : {};
  return { id: j.id, host: j.host || null, files: r.files || [], ticks, tools, adopted: now };
}
/** The audio step a chain needs next: tower's checklist plus what the adopted steps ticked (they land on tower only with cpu-finish). Pure. */
export function chainNext(meta, chain = {}) {
  const c = checklistOf(meta, haveOf(chain));
  for (const t of AUDIO_TYPES) Object.assign(c.stages, chain[t]?.ticks || {});
  return nextJobs(c).find((t) => AUDIO_TYPES.includes(t)) || null;
}

// ---- the split and the order ----
/** Does this talk take the typed path? A stable per-talk share of MEDIA_TYPED_FRACTION (0 = whole path only). */
export function typedShare(itemId, fraction = Number(process.env.MEDIA_TYPED_FRACTION) || 0) {
  if (!(fraction > 0)) return false;
  if (fraction >= 1) return true;
  return parseInt(createHash('sha256').update(String(itemId)).digest('hex').slice(0, 8), 16) / 0x100000000 < fraction;
}
/** The typed chain is the whole-recording job split three ways (cpu-finish's result IS a whole result), so it takes exactly the talks the
 *  `whole` kind takes; remasters of published talks keep their restore/post kinds (a gpu step re-transcribes, which would redo the text). */
export const typedEligible = (st, id) => st.items?.[id]?.kind === 'whole';

/** 0 new talk · 1 remaster of a published talk · 2 re-run campaign (st.items[id].rerun). */
export const bandOf = (st, id) => (st.items?.[id]?.kind === 'whole' ? 0 : st.items?.[id]?.rerun ? 2 : 1);
/** Queue priority from the band (higher claims first). */
export const priorityOf = (st, id) => 2 - bandOf(st, id);
/** → the index in st.queue to feed next, or -1. Best band first; every 5th pick the OLDEST talk of a lower band (priority is order, never a filter). */
export function pickNext(st, can = () => true) {
  const idx = st.queue.map((id, i) => [id, i]).filter(([id]) => can(id));
  if (!idx.length) return -1;
  const best = Math.min(...idx.map(([id]) => bandOf(st, id)));
  st.picks = (st.picks || 0) + 1;
  if (st.picks % 5 === 0) { const lower = idx.find(([id]) => bandOf(st, id) > best); if (lower) return lower[1]; }
  return idx.find(([id]) => bandOf(st, id) === best)[1];
}

/** Where the gpu step runs. With pods allowed typed (MEDIA_POD_TYPED=1 = { edge: true }): first the pods' R2 buffer (the edge /_q) up to
 *  want_h audio-h (Chad 10-31: gpu work waits on R2 BEFORE a pod boots, so a pod never sits idle), then the LAN (home GPU) until it holds
 *  TARGET_H, then the edge again. No home GPU engaged → the edge. Pure. */
export function gpuRoute(lanCap, { edge = false, targetH = 2.5, staged_h = 0, want_h = 0 } = {}) {
  if (!edge) return 'lan';
  if (staged_h < want_h) return 'edge';
  if (!lanCap?.hosts?.some((h) => (h.types || []).includes('gpu'))) return 'edge';
  return (lanCap.by_type?.gpu?.queued_h || 0) >= targetH ? 'edge' : 'lan';
}
