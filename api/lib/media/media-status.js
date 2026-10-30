// Media progress + per-talk status for the internal API (/api/admin/ops/media/*) and Dewey's tools. Read-only over the stage ledger
// (media_stages), the catalogue and the cloud lane's state file; adds go through the media-scan report, redos through media-stages.
// Deps: repos/media-ledger-repo.js, repos/media-repo.js, repos/ops-report-repo.js, media/item.js. Plan: planning/media-ledger-plan-20261030.md

const deps0 = async () => ({
  ledger: await import('../repos/media-ledger-repo.js'),
  repo: await import('../repos/media-repo.js'),
  ops: await import('../repos/ops-report-repo.js'),
  item: await import('./item.js'),
  cloud: await import('./cloud.js'),
  now: () => Date.now(),
});

/** The whole picture: per-stage talks + audio-hours, the last hour / day, catalogue states, and the remaster lane. */
export async function mediaProgress(d = null) {
  d ||= await deps0();
  const t = d.now(), iso = (ms) => new Date(t - ms).toISOString();
  const [stages, hour, day, states] = await Promise.all([d.ledger.stageCounts(), d.ledger.stagesSince(iso(3600_000)), d.ledger.stagesSince(iso(86400_000)), d.repo.mediaStates()]);
  const st = await d.cloud.loadState().catch(() => null);
  const done1h = (st?.done || []).filter((x) => t - (x.at || 0) < 3600_000);
  const lane = st ? { queue: (st.queue || []).length, in_flight: Object.keys(st.jobs || {}).length, pods: Object.values(st.pods || {}).filter((p) => !p.terminated).length,
    staged_talks: Object.keys(st.staged || {}).length, remastered_1h: done1h.length, audio_h_1h: Math.round(done1h.reduce((a, x) => a + (Number(x.audio_s) || 0), 0) / 360) / 10,
    spent_usd: Math.round(d.cloud.spendOf(st, t) * 100) / 100, updated_s: st.updated ? Math.round((t - st.updated) / 1000) : null } : null;
  return { stages, last_hour: hour, last_day: day, states, lane, complete_stages: d.item.COMPLETE_STAGES };
}

/** One talk by id or slug (or matches by title/speaker): its catalogue row, every stage, and what is still missing. */
export async function mediaStatus(ref, d = null) {
  d ||= await deps0();
  const s = String(ref ?? '').trim();
  if (!s) return { error: 'give an id, slug or title' };
  const row = /^\d+$/.test(s) ? await d.repo.getMediaItem(Number(s)) : await d.repo.getMediaBySlug(s);
  if (!row) {
    const matches = await d.ledger.findTalks(s);
    if (matches.length !== 1) return { matches };
    return mediaStatus(String(matches[0].id), d);
  }
  const stages = await d.ledger.itemStages(row.id);
  const done = new Set(stages.filter((x) => x.status === 'done').map((x) => x.stage));
  const missing = d.item.COMPLETE_STAGES.filter((x) => !done.has(x));
  return { item: { id: row.id, slug: row.slug, title: row.title, speaker: row.speaker, state: row.state, stage: row.stage, why: row.why, duration_s: row.duration_s,
    published_at: row.published_at, completed_at: row.completed_at, verdict: row.verdict, grade: row.grade, source_kind: row.source_kind, source_ref: row.source_ref },
    stages, missing, complete: !missing.length && !!row.restored };
}

/** Add recordings (URLs, or files under /tank/media or /tank/dewey-ingest) → the media-scan report (holdings check first). */
export async function mediaAdd({ urls = [], paths = [], by = 'ops' } = {}, d = null) {
  d ||= await deps0();
  const bad = paths.filter((p) => !/^\/tank\/(media|dewey-ingest)\//.test(String(p)) || String(p).includes('..'));
  if (bad.length) return { error: `paths must be under /tank/media or /tank/dewey-ingest: ${bad.join(', ')}` };
  if (!urls.length && !paths.length) return { error: 'nothing to add' };
  const run = await d.ops.enqueue('media-scan', { urls, paths, roots: [], batch: 1 }, by);
  return { queued: true, run: run?.id ?? null };
}

/** Redo stages of talks → the media-stages report (write; only those stages, the rest kept). */
export async function mediaRedo({ ids = [], stages = [], by = 'ops' } = {}, d = null) {
  d ||= await deps0();
  const ok = stages.filter((s) => d.item.STAGES.includes(s)), nums = ids.map(Number).filter(Number.isFinite);
  if (!nums.length || !ok.length) return { error: `ids and stages required (stages: ${d.item.STAGES.join(', ')})` };
  const run = await d.ops.enqueue('media-stages', { write: true, ids: nums, redo: ok }, by);
  return { queued: true, run: run?.id ?? null, ids: nums, stages: ok };
}
