// A typed chain's audio input (Chad 10-30/11-01/11-02). Tower PLANS it from the original's size + duration (no ffmpeg on tower); cpu-prep MAKES it
// (whole-worker/phases.mjs) with these exact args; gpu and cpu-finish decode that same file. Pure: no I/O. Shared by tower (r2-stage.js,
// queue-feed.js) and the worker image (bundled into cpu-prep.mjs).

// Pods get Opus 96k mono 48 kHz (= split_restore.py TRANSIT, measured on 5 talks: within noise of the original). Only a source above 96 kbps.
export const OPUS_IN = ['-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', '-application', 'audio'];
export const needsOpus = (bytes, durS) => Number(durS) > 0 && Number(bytes) / Number(durS) > 12_000;
export const VIDEO = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', '3gp']);
export const AUDIO_EXT = { aac: 'm4a', alac: 'm4a', mp3: 'mp3', opus: 'ogg', vorbis: 'ogg', flac: 'flac' };   // codec → a container that holds it as-is

export const opusArgs = (src, out) => ['-nostdin', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-vn', ...OPUS_IN, out];
export const codecArgs = (src) => ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', src];
export const demuxArgs = (src, out, ext, seconds = null) => ['-nostdin', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-vn', ...(seconds ? ['-t', String(seconds)] : []), '-c:a', 'copy', ...(ext === 'm4a' ? ['-movflags', '+faststart'] : []), out];
/** ffprobe's codec_name output → the stream-copy container ext, or null (no audio / no safe container: the original is the input). */
export const demuxExt = (stdout) => AUDIO_EXT[String(stdout || '').trim().split('\n')[0]] || null;

/** Tower: what cpu-prep makes of this original → { how: 'opus' } (above 96 kbps, or ANY decoded WAV/FLAC/AIFF) | { how: 'demux' } (a video) | null (the original is the input). */
export function chainPlan(original, bytes, durS) {
  const ext = String(original || '').slice(String(original || '').lastIndexOf('.') + 1).toLowerCase();
  // 11-03 (Chad): "We do not process WAV files. We first convert to Ogg (Opus) and then we work with Opus." Decoded audio is converted whatever its size or length
  if (['wav', 'flac', 'aif', 'aiff'].includes(ext) || needsOpus(bytes, durS)) return { how: 'opus' };
  return VIDEO.has(ext) ? { how: 'demux' } : null;
}
/** Where cpu-prep puts the chain input inside item/ (listed in result.json, so it is uploaded like any output; never under original/). */
export const CHAIN_DIR = 'chain';
export const NAME_RE = /^in\.[a-z0-9]{2,5}$/;
