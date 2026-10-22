// A SHORT for one range of one talk (shorts.js builds the captions/spec; render_short.py on boss draws it): plan → cache
// check → audio clip + face-centred portrait + QR (tower, light) → render (boss CPU through the gate) → the MP4, .srt, .vtt
// and a ready-to-paste post in the item folder (shorts/<key>.*). Public and cacheable: the same moment, format and template
// always map to the same files. Deps injected for tests.
import { join } from 'path';
import { mkdir, readFile, writeFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { clampRange, clipWords, shortKey, pickTemplate, scriptureIn, buildAss, renderSpec, srtOf, vttOf, postText, TEMPLATES } from './shorts.js';

const readJson = async (p) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };
const exists = async (p) => !!(await stat(p).catch(() => null));

/** What a request would produce, from the item and its files (no rendering). → { key, template, why, range, moment, urls, files } */
export async function planShort(item, params, { read = readJson } = {}) {
  if (!item || item.state !== 'done' || !item.dir) throw new Error('no published talk by that name');
  if (item.playback === 'search') throw new Error('this talk is not available for playback');
  const meta = await read(join(item.dir, 'meta.json'));
  const tr = await read(join(item.dir, 'transcript.json'));
  if (!meta || !tr) throw new Error('the talk has no transcript yet');
  const range = clampRange(params, meta.duration_s || Infinity);
  const moment = (meta.moments || []).find((m) => Math.abs(m.t0_ms / 1000 - range.start) < 0.6 && Math.abs(m.t1_ms / 1000 - range.end) < 0.6) || null;
  const scripture = scriptureIn(tr.quotes || [], tr.cross_references || [], range.start, range.end);
  const pick = pickTemplate({ asked: TEMPLATES.includes(params.template) ? params.template : null, year: meta.year, grade: meta.quality?.overall,
    scripture: !!scripture, key: moment?.key || `${item.slug}|${range.start}|${range.end}` });
  const key = shortKey({ slug: item.slug, ...range, template: pick.template, version: meta.version || 1 });
  const t = Math.floor(range.start);
  const urls = { shown: moment ? `siftersearch.com/m/${moment.key}` : `siftersearch.com/media/${item.slug}?t=${t}`, full: `https://siftersearch.com/media/${item.slug}?t=${t}` };
  const base = `/api/media/${item.slug}/file/shorts/${key}`;
  return { key, ...pick, range, moment, scripture, meta, tr, urls, files: { mp4: `${base}.mp4`, srt: `${base}.srt`, vtt: `${base}.vtt`, post: `${base}.json` } };
}

/** Render (or reuse) the short. deps: { tools: { ffmpeg, renderShort }, portraitUrl(item) → url|null, fetchImpl, qr(text) → Buffer } */
export async function renderShortFor(item, params, deps = {}) {
  const plan = await planShort(item, params, deps);
  const dir = join(item.dir, 'shorts');
  const mp4 = join(dir, `${plan.key}.mp4`);
  const result = () => ({ slug: item.slug, key: plan.key, template: plan.template, why: plan.why, format: plan.range.format, start: plan.range.start, end: plan.range.end,
    moment: plan.moment?.key || null, url: plan.files.mp4, srt: plan.files.srt, vtt: plan.files.vtt, post: plan.files.post });
  if (!params.force && await exists(mp4)) return { ...result(), cached: true };
  const { meta, tr, range } = plan;
  const clip = Math.round((range.end - range.start) * 100) / 100;
  const words = clipWords(tr.paragraphs, range.start, range.end);
  if (words.length < 3) throw new Error('no transcript words in that range');
  const work = join(tmpdir(), `media-short-${process.pid}-${plan.key}`);
  await mkdir(work, { recursive: true });
  const tools = deps.tools || await import('./tools.js');
  try {
    // the best version we serve (the web rendition of the listening copy; a remastered copy once Chad picks one)
    await tools.ffmpeg(['-y', '-ss', String(range.start), '-to', String(range.end), '-i', join(item.dir, 'web', `${item.slug}.m4a`), '-vn', '-c:a', 'aac', '-b:a', '160k', join(work, 'audio.m4a')], { timeoutMs: 120_000 });
    let portrait = false;
    const purl = deps.portraitUrl ? await deps.portraitUrl(item) : null;
    // the portrait: three tries (10-22: the first short after a restart got none and cached a portrait-less render)
    let portraitError = purl ? null : 'no portrait on record';
    for (let k = 0; purl && !portrait && k < 3; k++) {
      if (k) await new Promise((r) => setTimeout(r, 2000 * k));
      try {
        const r = await (deps.fetchImpl || fetch)(`${purl}${purl.includes('?') ? '&' : '?'}tr=w-900,h-900,fo-face,q-85`, { signal: AbortSignal.timeout(30000) });
        const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
        if (buf && buf.length > 2000) { await writeFile(join(work, 'portrait.jpg'), buf); portrait = true; portraitError = null; } else portraitError = `HTTP ${r.status}, ${buf?.length ?? 0} bytes`;
      } catch (err) { portraitError = String(err?.cause?.code || err?.message || err).slice(0, 120); }
    }
    const qr = deps.qr || (async (text) => (await import('qrcode')).default.toBuffer(text, { margin: 2, width: 460, color: { dark: '#1A1F24', light: '#F6EEDC' } }));
    await writeFile(join(work, 'qr.png'), await qr(plan.urls.full));
    await writeFile(join(work, 'captions.ass'), buildAss({ template: plan.template, format: range.format, words, speaker: meta.speaker, title: meta.title, year: meta.year,
      url: plan.urls.shown, clip, scripture: plan.scripture }));
    await writeFile(join(work, 'spec.json'), JSON.stringify(renderSpec({ template: plan.template, format: range.format, clip, portrait })));
    const t0 = Date.now();
    const video = await tools.renderShort(work);
    const ms = Date.now() - t0;
    await mkdir(dir, { recursive: true });
    await writeFile(`${mp4}.tmp`, video); await (await import('fs/promises')).rename(`${mp4}.tmp`, mp4);
    await writeFile(join(dir, `${plan.key}.srt`), srtOf(words));
    await writeFile(join(dir, `${plan.key}.vtt`), vttOf(words));
    const post = postText({ words, speaker: meta.speaker, title: meta.title, year: meta.year, url: plan.urls.shown, fullUrl: plan.urls.full, topics: meta.topics || [], tradition: meta.tradition || "Bahá'í" });
    await writeFile(join(dir, `${plan.key}.json`), JSON.stringify({ ...result(), post, portrait, portrait_error: portraitError, render_ms: ms, clip_s: clip, bytes: video.length, at: new Date().toISOString() }, null, 1));
    return { ...result(), cached: false, portrait, portrait_error: portraitError, render_ms: ms, bytes: video.length, post };
  } finally { await rm(work, { recursive: true, force: true }); }
}
