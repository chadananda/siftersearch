// Tag hints for already-imported talks: media-tags-backfill (read tags from the original, fill meta.tag_hints only) and the
// media-hint-review report (talks where tag/filename/folder/transcript disagree or the tag adds a missing speaker/title/series).
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { applyTagHints, compareHints } from '../media/tag-hints.js';
import { enqueue } from '../repos/ops-report-repo.js';

const readMeta = async (dir) => { try { return JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')); } catch { return null; } };
const writeMeta = async (dir, meta) => { const f = join(dir, 'meta.json'), tmp = `${f}.hints.${process.pid}`; await writeFile(tmp, JSON.stringify(meta, null, 1)); await rename(tmp, f); };

/** media-tags-backfill { afterId?, limit = 20, pauseMs = 1500, again = false }: a small, paced page; queues its own next page. Hints only. */
export async function mediaTagsBackfillJob({ afterId = 0, limit = 20, pauseMs = 1500, again = false, chain = true } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const ops = deps.ops || await import('../repos/ops-report-repo.js');
  const probeTags = deps.probeTags || (await import('../media/tools.js')).ffprobeTags;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const queue = deps.queue || enqueue;
  const lim = Math.max(1, Math.min(40, Number(limit) || 20));
  const rows = await repo.hintItems({ afterId, limit: lim });
  const busy = new Set((await Promise.all(['media-item', 'media-llm', 'media-compute', 'media-asr'].map((n) => ops.pendingRuns(n)))).flat().map((r) => Number(r.params?.id)).filter(Boolean));
  const out = { read: 0, hinted: 0, no_tags: 0, skipped_have: 0, skipped_busy: 0, probe_failed: 0, from: afterId, last: afterId };
  for (const it of rows) {
    out.last = it.id;
    if (busy.has(it.id)) { out.skipped_busy++; continue; }
    const meta = await (deps.readMeta || readMeta)(it.dir);
    if (!meta) continue;
    if (meta.tag_hints !== undefined && !again) { out.skipped_have++; continue; }
    const file = meta.original ? join(it.dir, meta.original) : it.source_ref;
    const probe = await probeTags(file);
    out.read++;
    if (!probe.ok) { out.probe_failed++; meta.tag_hints = null; meta.tag_hints_error = probe.error; }
    else { await applyTagHints(meta, probe, { filename: meta.source?.path || file, ctx: deps.ctx || {} }); if (meta.tag_hints) out.hinted++; else out.no_tags++; }
    const fresh = await (deps.readMeta || readMeta)(it.dir);   // merge into the latest file: only the hint fields change
    if (fresh) { for (const k of ['tag_hints', 'tag_hints_error', 'hint_conflicts', 'hint_proposals']) { if (k in meta) fresh[k] = meta[k]; else delete fresh[k]; } await (deps.writeMeta || writeMeta)(it.dir, fresh); }
    await sleep(pauseMs);
  }
  if (chain && rows.length === lim) await queue('media-tags-backfill', { afterId: out.last, limit: lim, pauseMs, again }, 'media-tags-backfill');
  else out.done = true;
  return out;
}

/** media-hint-review { limit = 400 }: read-only. Items whose tags conflict with the filename/folder/transcript, or add a speaker/title/series. */
export async function mediaHintReviewJob({ limit = 400 } = {}, deps = {}) {
  const repo = deps.repo || await import('../repos/media-repo.js');
  const out = { scanned: 0, with_tags: 0, conflicts: [], adds_speaker: [], adds_title: [], adds_series: [], low_confidence_sequence: 0 };
  const albums = new Map();   // album → [{track}] — continuity among neighbours
  const keep = [];
  for (let after = 0; ;) {
    const rows = await repo.hintItems({ afterId: after, limit: 200 });
    if (!rows.length) break;
    after = rows.at(-1).id;
    for (const it of rows) {
      const meta = await (deps.readMeta || readMeta)(it.dir);
      out.scanned++;
      if (!meta?.tag_hints) continue;
      out.with_tags++; keep.push({ it, meta });
      if (meta.tag_hints.album && meta.tag_hints.track) { const a = albums.get(meta.tag_hints.album) || []; a.push({ album: meta.tag_hints.album, track: meta.tag_hints.track }); albums.set(meta.tag_hints.album, a); }
    }
  }
  for (const { it, meta } of keep) {
    const siblings = (albums.get(meta.tag_hints.album) || []).filter((s) => s.track !== meta.tag_hints.track);
    const cmp = await compareHints(meta.tag_hints, meta, { siblings, people: deps.people, notSpeakers: deps.notSpeakers });
    const row = { id: it.id, slug: it.slug, title: meta.title, speaker: meta.speaker, tag: { title: meta.tag_hints.title, artist: meta.tag_hints.artist, album: meta.tag_hints.album, track: meta.tag_hints.track, track_of: meta.tag_hints.track_of } };
    if (cmp.conflicts.length) out.conflicts.push({ ...row, conflicts: cmp.conflicts, sequence: cmp.sequence });
    if (cmp.proposals.speaker) out.adds_speaker.push({ ...row, proposal: cmp.proposals.speaker });
    if (cmp.proposals.title) out.adds_title.push({ ...row, proposal: cmp.proposals.title });
    if (cmp.proposals.series) out.adds_series.push({ ...row, proposal: cmp.proposals.series });
    if (cmp.sequence && cmp.sequence.confidence < 0.4) out.low_confidence_sequence++;
  }
  const cap = Math.max(1, Number(limit) || 400);
  const counts = { conflicts: out.conflicts.length, adds_speaker: out.adds_speaker.length, adds_title: out.adds_title.length, adds_series: out.adds_series.length };
  for (const k of Object.keys(counts)) out[k] = out[k].slice(0, cap);
  return { ...out, counts };
}
