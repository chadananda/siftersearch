// Registered media hosts (config/media-hosts.json, MEDIA_HOSTS overrides). Names + transport only; capacity comes from each machine.
import fs from 'node:fs';
export function mediaHosts(env = process.env) {
  if (env.MEDIA_HOSTS != null) return env.MEDIA_HOSTS.split(',').map((x) => x.trim()).filter(Boolean).map((x) => ({ name: x.split('=')[0], transport: 'ssh-docker' }));
  try { return JSON.parse(fs.readFileSync(new URL('../../config/media-hosts.json', import.meta.url), 'utf8')).hosts || []; } catch { return []; }
}
/** The host whose GPU can be sampled over a shell (nvidia-smi): the first docker-transport host, or MEDIA_GPU_HOST. */
export const shellGpuHost = (env = process.env) => env.MEDIA_GPU_HOST ?? mediaHosts(env).find((h) => (h.transport || 'ssh-docker') === 'ssh-docker')?.name ?? '';
