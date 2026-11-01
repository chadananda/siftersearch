// Tower's cpu-finish agent — the documented exception to tower placement (Chad 10-31): typed cpu-finish jobs only, from tower's LAN queue.
// pm2 starts it through scripts/ops/in-slice.sh (the agent in the user sifter-bulk.slice); every job container runs with --cgroup-parent
// sifter-bulk.slice, the SYSTEM twin of that slice (docs/ops/sifter-bulk.system.slice: 16 cores, 20 GB, weight 10), since dockerd, not the agent, owns it.
export const towerFinishArgs = (env = process.env) => ['--host', 'tower', '--types', 'cpu-finish', '--slots', env.MEDIA_FINISH_SLOTS || '2', '--gb-per-talk', '6',
  '--root', env.MEDIA_FINISH_ROOT || '/tank/media/.finish-work', '--run', 'docker', '--device', 'none', '--cpus', env.MEDIA_FINISH_CPUS || '6',
  // t3q = t3 + the quality.py stderr fix only (11-01: job 2530's pipe deadlock), built on tower from t3 (ghcr pulls of t9 stall there)
  '--image', env.MEDIA_FINISH_IMAGE || 'sifter-media-worker:gpu-20261031-t3q', '--cgroup-parent', 'sifter-bulk.slice'];
if (process.argv[1]?.endsWith('tower-finish.mjs')) {
  for (const f of ['.env-public', '.env-secrets']) process.loadEnvFile(f);
  process.env.MEDIA_QUEUE_KEY ||= process.env.INTERNAL_API_KEY;   // the admin key works every queue op (api/routes/media-queue.js)
  process.env.MEDIA_QUEUE_URL ||= 'http://127.0.0.1:7843/api/admin/ops/queue';
  process.argv.splice(2, Infinity, ...towerFinishArgs());
  await import('./queue-agent.mjs');
}
