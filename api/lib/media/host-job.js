// One CPU container job on a HOME host over the LAN (ssh + rsync + docker; never R2): input files in, a script run in the worker image, outputs read back.
// Tower only moves files and polls. Used by the quiet pass (quiet-repair.js) and a drifted realign (realign-remote.js). Deps: tools.js hostProfile
import { hostProfile } from './tools.js';

export const q = (s) => "'" + String(s).replaceAll("'", "'\\''") + "'";

/** Start (or re-attach to: same name = same inputs) container `name` on `host`, wait for it to exit 0. → { read(file), get(file, local), cleanup() }.
 *  inputs: [[localPath, nameInJobDir]]. Admitted only while the host keeps `freeGb` free (it runs restore containers beside it). Throws code DRAIN on a drain
 *  (the container keeps running; the next run re-attaches); a failed container is removed so the next run starts it fresh. */
export async function hostJob({ T, host, image, name, inputs, script, label, cpus = 2, memGb = 3, freeGb = 4, env = {}, stop = () => false, nap = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const prof = hostProfile(host), root = prof.root, docker = prof.docker;
  if (prof.transport === 'gate') throw Error(`${host}: gate transport takes no ${label} jobs; use a docker host`);
  const remote = `${root}/${name}`;
  const run = (cmd, opts = {}) => T.run('ssh', [host, cmd], { timeoutMs: 120000, stop, ...opts });
  const put = (file, to) => T.run('rsync', ['-a', '--partial', '--protect-args', file, `${host}:${to}`], { timeoutMs: 900000, stop });
  const get = (from, to) => T.run('rsync', ['-a', '--partial', '--protect-args', `${host}:${from}`, to], { timeoutMs: 900000, stop });
  const state = async () => JSON.parse((await run(`${docker} inspect ${q(name)} --format '{{json .State}}' 2>/dev/null || echo null`)).stdout.trim());
  const cleanup = () => run(`${docker} rm -f ${q(name)} >/dev/null 2>&1; rm -rf ${q(remote)}`).catch(() => {});
  await run(`mkdir -p ${q(remote)}; ${docker} image inspect ${q(image)} >/dev/null`);
  if (!await state()) {
    for (const [file, as] of inputs) await put(file, `${remote}/${as}`);
    await run(`cat > ${q(remote + '/run.sh')}`, { input: script });
    const envArgs = Object.entries({ CUDA_VISIBLE_DEVICES: '', ...env }).map(([k, v]) => `-e ${k}=${v === '' ? '' : q(v)}`).join(' ');
    const launch = `if [ "$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)" -ge ${freeGb} ]; then ${docker} run -d --name ${q(name)} --network none --cpus ${cpus} --memory ${memGb}g ${envArgs} -v ${q(remote + ':/job')} --entrypoint sh ${q(image)} /job/run.sh; fi`;
    while (!await state()) {
      if (stop()) { const e = Error(`Awaiting ${label} slot`); e.code = 'DRAIN'; throw e; }
      await run(`flock -x ${q(root + '/dispatch.lock')} bash -c ${q(launch)}`);
      if (!await state()) await nap(15000);
    }
  }
  while (true) {
    if (stop()) { const e = Error(`${label} continues on the host`); e.code = 'DRAIN'; throw e; }
    const s = await state(); if (!s) throw Error(`${label} container disappeared`);
    if (!s.Running) {
      if (s.ExitCode) { const log = (await run(`${docker} logs --tail 6 ${q(name)} 2>&1`)).stdout.slice(-600); await cleanup(); throw Error(`${label} exited ${s.ExitCode}: ${log}`); }
      break;
    }
    await nap(5000);
  }
  return { read: async (file) => (await run(`cat ${q(`${remote}/${file}`)}`)).stdout, get: (file, to) => get(`${remote}/${file}`, to), cleanup };
}
