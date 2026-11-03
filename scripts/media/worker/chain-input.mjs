// A typed chain's audio input (Chad 10-30/11-01/11-02). Tower PLANS it from the original's size + duration (no ffmpeg on tower); cpu-prep MAKES it
// (whole-worker/phases.mjs) with these exact args; gpu and cpu-finish decode that same file. Pure: no I/O. Shared by tower (r2-stage.js,
// queue-feed.js) and the worker image (bundled into cpu-prep.mjs).

// The chain works on Opus 96k mono 48 kHz (= split_restore.py TRANSIT, measured on 5 talks: within noise of the original). 11-03 (Chad): "everything is
// converted to Opus, even video or MP3. The original file is kept and the metadata extracted, but we only process Opus."
export const OPUS_IN = ['-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', '-application', 'audio'];
/** An input the chain may process: Opus only (a .opus original, or the in.opus cpu-prep made). Anything else is converted first. */
export const isOpus = (name) => /\.opus$/i.test(String(name || ''));
export const VIDEO = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', 'ts', '3gp']);
export const AUDIO_EXT = { aac: 'm4a', alac: 'm4a', mp3: 'mp3', opus: 'ogg', vorbis: 'ogg', flac: 'flac' };   // codec → a container that holds it as-is

export const opusArgs = (src, out) => ['-nostdin', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-vn', ...OPUS_IN, out];
export const codecArgs = (src) => ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', src];
export const demuxArgs = (src, out, ext, seconds = null) => ['-nostdin', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-vn', ...(seconds ? ['-t', String(seconds)] : []), '-c:a', 'copy', ...(ext === 'm4a' ? ['-movflags', '+faststart'] : []), out];
/** ffprobe's codec_name output → the stream-copy container ext, or null (no audio / no safe container: the original is the input). */
export const demuxExt = (stdout) => AUDIO_EXT[String(stdout || '').trim().split('\n')[0]] || null;

/** Tower: what cpu-prep makes of this original → { how: 'opus' } for EVERY source (WAV, FLAC, MP3, M4A, video, …) | null (it is already .opus). */
export function chainPlan(original) {
  return isOpus(original) ? null : { how: 'opus' };
}
/** Where cpu-prep puts the chain input inside item/ (listed in result.json, so it is uploaded like any output; never under original/). */
export const CHAIN_DIR = 'chain';
export const NAME_RE = /^in\.[a-z0-9]{2,5}$/;
