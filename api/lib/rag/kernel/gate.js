import { DISAMB_THRESHOLD } from '../../pipeline/disambiguation.js';
// kernel/gate — enforce pipeline order: no entity/concept stage runs on a document whose disambiguation is
// incomplete (extracting from un-disambiguated text builds on sand). Coverage comes from the store (host
// schema); the threshold is a config knob. Throws to stop the calling stage.
// THRESHOLD 0.98 (was 0.99): MUST match the host's isDoneFromArtifacts/resumeStageFor "disambiguation
// done" bar (queue.js:78 uses 0.98). A higher gate than the resume bar strands every book between 98–99%:
// resumeStageFor calls disambiguation "done" and resumes from a later stage, which then fails this gate
// forever ("did not reach verify") without ever re-running disambiguate. The last ~1–2% is genuine
// un-disambiguatable residue (fragments/terminal-noted), safe for downstream stages. (2026-08-12 incident.)
export async function assertDisambiguated(ctx, docId, { threshold = DISAMB_THRESHOLD } = {}) {
  const ratio = await ctx.store.getDisambigCoverage(docId);
  if (ratio < threshold) {
    throw new Error(`CorpusRAG: doc ${docId} is ${(ratio * 100).toFixed(1)}% disambiguated (< ${(threshold * 100)}%) — run disambiguate first`);
  }
  return ratio;
}
