// Stage-ahead to R2 (Chad 10-30): tower's uplink (~18 Mbit/s) uploads queued originals to R2 continuously, hours ahead of the pods;
// a pod pulls its input from a signed URL in seconds instead of waiting on tower. Creds = the CF API token as S3 keys
// (key id = token id, secret = sha256(token)). Deps: @aws-sdk/client-s3. stageTick is pure apart from the injected store.
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export const STAGE = {
  aheadS: Number(process.env.MEDIA_STAGE_AHEAD_H ?? 100) * 3600,   // audio staged ahead of the pods (≈ 4 h of 3-5 pods)
  maxBytes: Number(process.env.MEDIA_STAGE_MAX_GB ?? 30) * 1e9,
  maxAgeMs: 36 * 3600_000,         // re-staged before the bucket rule media-stage-expire deletes stage/ objects at 2 days (the backstop for orphans)
  prefix: 'stage/',
};

/** The R2 store from CLOUDFLARE_API_TOKEN/ACCOUNT_ID, or null without them. → { put(key, path), signed(key, s), remove(key) } */
export async function r2StageStore(env = process.env) {
  const T = env.CLOUDFLARE_API_TOKEN, A = env.CLOUDFLARE_ACCOUNT_ID;
  if (!T || !A) return null;
  const v = await (await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${T}` } })).json();
  if (!v?.result?.id) return null;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const Bucket = env.MEDIA_STAGE_BUCKET || 'siftersearch-media';
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${A}.r2.cloudflarestorage.com`, credentials: { accessKeyId: v.result.id, secretAccessKey: createHash('sha256').update(T).digest('hex') } });
  return {
    put: async (Key, path) => { const { size } = await stat(path); await s3.send(new PutObjectCommand({ Bucket, Key, Body: createReadStream(path), ContentLength: size })); return size; },
    signed: (Key, expiresIn = 6 * 3600) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn }),
    remove: (Key) => s3.send(new DeleteObjectCommand({ Bucket, Key })),
  };
}

export const VIDEO = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', '3gp']);
const AUDIO_EXT = { aac: 'm4a', alac: 'm4a', mp3: 'mp3', opus: 'ogg', vorbis: 'ogg', flac: 'flac' };   // codec → a container that holds it as-is

/** The audio track of a video, stream-copied (no re-encode) to a temp file → { file, ext }, or null (no audio / a codec with no safe
 *  container: the original is sent). `run` is tower's process gate (tools.js run: ffmpeg -c:a copy is 'light'). */
export function audioDemuxer(run, tmpDir = tmpdir()) {
  return async (src) => {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', src], { timeoutMs: 60_000 });
    const ext = AUDIO_EXT[String(stdout).trim().split('\n')[0]];
    if (!ext) return null;
    const file = join(tmpDir, `sifter-stage-${process.pid}-${createHash('sha1').update(src).digest('hex').slice(0, 12)}.${ext}`);
    await run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-vn', '-c:a', 'copy', ...(ext === 'm4a' ? ['-movflags', '+faststart'] : []), file], { timeoutMs: 600_000 });
    return { file, ext };
  };
}

/** One stager step (mutates st.staged): drop objects whose talk left the lane, then upload the next queued original until aheadS of
 *  audio (or maxBytes) is staged. One upload per call — the caller loops; one at a time is what the uplink can carry anyway.
 *  busy(itemId) = assigned or being assigned right now; eligible(itemId) = a pod may take it (the assigner's own rule). → 'uploaded' | 'full' | 'idle' */
export async function stageTick(st, { store, getItem, readMeta, busy = () => false, eligible = () => true, demux = null, now = Date.now(), cfg = STAGE }) {
  st.staged ||= {};
  for (const [id, s] of Object.entries(st.staged)) {
    const live = (st.queue.some((q) => String(q) === id) && eligible(id)) || busy(id);
    if (live && now - s.at < cfg.maxAgeMs) continue;
    if (busy(id)) continue;
    await store.remove(s.key).catch(() => {});
    delete st.staged[id];
  }
  const staged = Object.entries(st.staged), dur = (id) => Number(st.items?.[id]?.duration_s) || 3600;
  const aheadS = staged.reduce((a, [id]) => a + dur(id), 0), bytes = staged.reduce((a, [, s]) => a + (s.bytes || 0), 0);
  if (aheadS >= cfg.aheadS || bytes >= cfg.maxBytes) return 'full';
  for (const id of st.queue) {
    if (st.staged[id] || st.stage_skip?.[id] || !eligible(id)) continue;   // 10-30: staged whole recordings (held off pods) while pods took the restores behind them
    const it = await getItem(id);
    const m = it?.dir ? await readMeta(it.dir).catch(() => null) : null;
    if (!m?.original) { (st.stage_skip ||= {})[id] = 'no original'; continue; }
    const src = `${it.dir}/${m.original}`;
    let ext = (m.original.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, ''), file = src, tmp = null;
    // Chad 10-30: "pushing video around to process audio is simply absurd" — a video sends only its audio track, bit for bit (stream copy, no re-encode)
    if (VIDEO.has(ext) && st.items?.[id]?.kind !== 'whole' && demux) {
      const a = await demux(src).catch(() => null);
      if (a) { ({ file, ext } = a); tmp = a.file; }
    }
    try {
      const key = `${cfg.prefix}${id}-${createHash('sha1').update(src).digest('hex').slice(0, 12)}.${ext}`;
      const size = await store.put(key, file);
      st.staged[id] = { key, ext, src, bytes: size, at: now, ...(tmp ? { audio_only: true } : {}) };
    } finally { if (tmp) await rm(tmp, { force: true }).catch(() => {}); }
    return 'uploaded';
  }
  return 'idle';
}
