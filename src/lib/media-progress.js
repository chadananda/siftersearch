// The Fireside Room's IMPORT READOUT and WORKBENCH helpers (Chad 10-22): GET /api/media/progress (totals, stages, by
// source, rate, ETA) and GET /api/media/progress/live (talks in processing with their steps, just published). Pure;
// tolerant of fields the API has not shipped yet (a stage without a number is simply not shown). Tested in
// tests/api/media-progress.test.js.
export const STAGES = [
  ['downloaded', 'Downloaded'], ['transcribed', 'Transcribed'], ['aligned', 'Aligned'], ['enhanced', 'Enhanced'],
  ['cross_referenced', 'Cross-referenced'], ['published', 'Published'],
];
const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/** The readout: total, the stages the payload carries (count, fraction), sources, rate, ETA. null when unusable. */
export function readout(p) {
  const total = n(p?.total_targets) ?? n(p?.total);
  if (!total) return null;
  const stages = STAGES.filter(([k]) => n(p[k]) != null).map(([k, label]) => ({ key: k, label, count: n(p[k]), frac: Math.min(1, n(p[k]) / total) }));
  const sources = (Array.isArray(p.by_source) ? p.by_source : []).filter((s) => s && n(s.total)).map((s) => ({
    key: String(s.source || s.label), label: String(s.label || s.source), total: n(s.total),
    stages: STAGES.filter(([k]) => n(s[k]) != null).map(([k, label]) => ({ key: k, label, count: n(s[k]), frac: Math.min(1, n(s[k]) / n(s.total)) })),
  }));
  return { total, stages, sources, failed: n(p.failed) || 0, perHour: n(p.items_per_hour), eta: p.eta_iso ? new Date(p.eta_iso) : null, at: p.updated_at || null };
}

export const fmt = (x) => (x == null ? '–' : Math.round(x).toLocaleString('en-US'));

/** "all by Tue 27 Oct" (or "" when unknown / past). */
export function etaText(eta, now = new Date()) {
  if (!(eta instanceof Date) || Number.isNaN(+eta) || eta <= now) return '';
  return `all by ${eta.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

/** The step track of a talk in processing: [{ name, label, state: done|running|failed|pending }]. */
export const STEP_LABEL = { download: 'Download', grade: 'Grade', enhance: 'Enhance', transcribe: 'Transcribe', align: 'Align', cleanup: 'Clean up',
  'cross-reference': 'Cross-reference', crossref: 'Cross-reference', assess: 'Assess', moments: 'Moments', publish: 'Publish' };
export function stepTrack(steps = []) {
  return (Array.isArray(steps) ? steps : []).filter((s) => s && s.name).map((s) => ({ name: String(s.name), label: STEP_LABEL[s.name] || String(s.name).replace(/[-_]/g, ' '),
    state: ['done', 'running', 'failed'].includes(s.state) ? s.state : 'pending' }));
}

/** "4 min 12 s" / "1 h 03 min" since an ISO time. */
export function elapsed(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  let s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60); s %= 60;
  return m < 60 ? `${m} min ${String(s).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export const SOURCE_LABEL = { curated: 'Curated', 'hooper-dunbar': 'Hooper Dunbar', 'hands-uhj': 'Hands & House', local: 'Local', other: 'Other' };

// ── the PROCESS STRIP: the signal chain a talk travels (Chad 10-22: "we are not just copying media") ──
export const TILES = [
  { id: 'import', name: 'Import', line: 'Gathered from archives, tapes and collectors’ channels.', steps: ['download', 'grade'],
    count: (p) => p.downloaded, unit: (n, p) => `${fmt(n)} of ${fmt(p.total_targets)} gathered` },
  { id: 'remaster', name: 'Remaster', line: 'Worn tapes restored — noise, hum, muffled voices. The original is always kept.', steps: ['enhance'],
    count: (p) => p.enhanced, unit: (n) => `${fmt(n)} restored` },
  { id: 'transcribe', name: 'Transcribe', line: 'Every word aligned to the audio: click any word and hear it.', steps: ['transcribe', 'align', 'diarize'],
    count: (p) => p.transcribed, unit: (n) => `${fmt(n)} transcribed` },
  { id: 'correct', name: 'Correct', line: 'Copy-edited with the whole talk in view; names and transliteration fixed. Never a word added.', steps: ['cleanup', 'faithfulness', 'publish', 'subheaders'],
    count: (p) => p.published, unit: (n) => `${fmt(n)} on the air` },
  { id: 'quotes', name: 'Link quotes', line: 'Every passage the speaker recites, linked to its source in the Writings.', steps: ['crossref'],
    count: (p) => p.quote_links, unit: (n) => `${fmt(n)} quotations linked` },
  { id: 'ideas', name: 'Cross-reference', line: 'Teachings the speaker mentions, linked to where they are stated.', steps: ['links'],
    count: (p) => p.concept_crs, unit: (n) => `${fmt(n)} ideas cross-referenced` },
  { id: 'moments', name: 'Moments', line: 'The notable statements, ready to hear and to share.', steps: ['assess', 'moments'], count: () => null, unit: () => '' },
];
const STEP_TILE = Object.fromEntries(TILES.flatMap((t) => t.steps.map((s) => [s, t.id])));
const STAGE_TILE = { archive: 'import', grade: 'import', enhance: 'remaster', web: 'remaster', transcribe: 'transcribe', correct: 'correct', clean: 'correct',
  describe: 'correct', thumb: 'correct', render: 'correct', ingest: 'correct', catalog: 'correct', headings: 'correct', quotes: 'quotes', links: 'ideas', assess: 'moments' };

/** Which tile a talk in processing sits in: its first running (or failed) step, else its pipeline stage. */
export function tileOf(item) {
  const steps = Array.isArray(item?.stages) ? item.stages : [];
  const cur = steps.find((s) => s?.state === 'running' || s?.state === 'failed');
  return (cur && STEP_TILE[cur.name]) || STAGE_TILE[item?.stage] || 'import';
}
/** in_progress[] → Map tile id → talks in it (in arrival order). */
export function byTile(inProgress = []) {
  const m = new Map(TILES.map((t) => [t.id, []]));
  for (const it of Array.isArray(inProgress) ? inProgress : []) if (it && (it.slug || it.title)) m.get(tileOf(it)).push(it);
  return m;
}
/** The headline numbers: on the air, processing (the whole import), in progress (downloaded, not yet published), queued. */
export function headline(p) {
  const total = n(p?.total_targets) ?? 0, published = n(p?.published) ?? 0, downloaded = n(p?.downloaded) ?? 0;
  const inProgress = Math.max(0, downloaded - published), queued = Math.max(0, total - downloaded);
  const today = n(p?.published_24h) ?? n(p?.added_today);
  return { total, published, inProgress, queued, perHour: n(p?.items_per_hour), today };
}
