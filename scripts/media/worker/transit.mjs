// No decoded audio in the cloud (Chad 10-31: "never store flac in the cloud"). A typed result that lists a FLAC/WAV and is bound for the
// edge (R2) sends an Opus transit of it instead (split_restore.py TRANSIT settings); tower decodes it back to the listed name on adoption.
// REBUILT files are not sent at all (the next step rebuilds them). Shipped beside queue-agent.mjs; imported by tower (stage-jobs, queue-feed). Pure.
export const DECODED = /\.(flac|wav)$/i;
export const isDecoded = (p) => DECODED.test(String(p || ''));
// files a step rebuilds from the previous step's checkpoint: light.flac = one deterministic ffmpeg pass over the original (enh_ck.m0)
export const REBUILT = new Set(['enhanced/light.flac']);
export const TRANSIT = { codec: 'libopus', b: '96k', ar: 48000, ac: 1, application: 'audio' };   // = split_restore.py TRANSIT
export const transitName = (p) => p.replace(DECODED, '.transit.ogg');
export const transitArgs = (src, dst) => ['-nostdin', '-y', '-v', 'error', '-i', src, '-vn', '-ac', String(TRANSIT.ac), '-ar', String(TRANSIT.ar),
  '-c:a', TRANSIT.codec, '-b:a', TRANSIT.b, '-application', TRANSIT.application, dst];
// back to the listed name on tower (towerClass 'encode': -c:a flac, no filter chain)
export const untransitArgs = (src, dst) => ['-nostdin', '-y', '-v', 'error', '-i', src, '-ac', String(TRANSIT.ac), '-ar', String(TRANSIT.ar), '-c:a', 'flac', dst];

/** What a result's listed files become on the way to a queue: cloud → no decoded name ever (REBUILT dropped, the rest as transit);
 *  LAN → as listed. files = result.json files [{path, sha256}]. → { send: [path], transit: [{ path, of }] }. */
export function cloudPlan(files = [], { cloud }) {
  const send = [], transit = [];
  for (const { path } of files) {
    if (!cloud || !isDecoded(path)) send.push(path);
    else if (!REBUILT.has(path)) { const t = transitName(path); transit.push({ path: t, of: path }); send.push(t); }
  }
  return { send, transit };
}
