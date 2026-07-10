// Unified enrichment orchestrator (docs/architecture/unified-enrichment-pipeline.md).
// ONE coordinator, priority-ordered, gated. Runs each stage by spawning the proven
// scripts/entity-read/* drivers as ISOLATED SUBPROCESSES — process isolation means a stage
// crash (OOM, unhandled rejection) can never take down the coordinator or the other stages.
// Idempotent: RESUME=1 makes each driver skip already-done paragraphs, so re-running a partial
// doc completes only the remainder. The DISAMBIGUATE→{HyPE∥EXTRACT} order is enforced by
// pickNextWork() (HyPE/extract are only offered once disambig_status='done').
// Deps: node child_process, state.js, profile.js, db.js.

import { spawn } from 'node:child_process';
import { pickNextWork, setStage, DISAMBIG_VERSION, HYPE_VERSION } from './state.js';
import { detectProfile } from './profile.js';
import { queryOne } from '../db.js';

const WRITER = process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849';
const EXTRACT_VERSION = 'extract-v2';

// Each stage → the driver script(s) that perform it. extract = mentions then claims (sequential).
const STAGE_SCRIPTS = {
  disambig: ['scripts/entity-read/disambiguate-book.mjs'],
  hype:     ['scripts/entity-read/hype-book.mjs'],
  extract:  ['scripts/entity-read/build-mentions.mjs', 'scripts/entity-read/extract-claims-v2.mjs'],
};
const STAGE_VERSION = { disambig: DISAMBIG_VERSION, hype: HYPE_VERSION, extract: EXTRACT_VERSION };

async function docProfile(docId) {
  const doc = await queryOne(
    `SELECT id, lang, religion, collection, title, description, doc_priority FROM docs WHERE id=?`, [docId]);
  const sample = (await queryOne(
    `SELECT text FROM content WHERE doc_id=? AND blocktype IN ('paragraph','quote') AND deleted_at IS NULL ORDER BY paragraph_index LIMIT 1`, [docId]))?.text || '';
  return detectProfile(doc || { id: docId }, sample);
}

function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env, SIFTER_WRITER_URL: WRITER, WRITE: '1' },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

/** Run one stage for one doc. Reuses the doc's profile (model/segmentation). */
export async function runStage(docId, stage) {
  const prof = await docProfile(docId);
  const env = { DOC: String(docId), MODEL: prof.modelId, CONC: process.env.PIPE_CONC || '4', RESUME: '1' };
  await setStage(docId, stage, 'running');
  for (const script of STAGE_SCRIPTS[stage]) {
    const ok = await runScript(script, env);
    if (!ok) { await setStage(docId, stage, 'error', { error: `${script} exited non-zero` }); return false; }
  }
  await setStage(docId, stage, 'done', { version: STAGE_VERSION[stage], error: null });
  return true;
}

/** Compute the next stage a released doc needs, or null. Pure (for dry preview). */
export function nextStageOf(row) {
  if (row.disambig_status !== 'done') return 'disambig';
  if (row.disambig_version !== DISAMBIG_VERSION) return 'disambig';
  if (row.hype_status !== 'done') return 'hype';
  if (row.extract_status !== 'done') return 'extract';
  return null;
}

/** Process released work in priority order until drained or `max` units done. */
export async function drain({ max = Infinity } = {}) {
  let n = 0;
  while (n < max) {
    const w = await pickNextWork();
    if (!w) break;
    console.error(`→ doc ${w.doc_id} · ${w.stage}${w.partial ? ' (partial)' : ''}`);
    const ok = await runStage(w.doc_id, w.stage);
    console.error(`  ${ok ? 'done' : 'ERROR'} · doc ${w.doc_id} · ${w.stage}`);
    n++;
  }
  return n;
}
