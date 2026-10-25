// THE WORKER POOL (Chad 10-24: prep, encodes and probes leave tower): rented pods join aorus and boss as HOSTS of the same gate
// (scripts/media/boss-asr-gate.sh, baked at /opt/gate in the worker image), so every existing dispatch path — withProbeHost, gpuOrTower,
// encodeRemote — can use them with no new verb. The cloud lane writes the registry when a pod is ready and removes it when the pod goes;
// tools.js reads it. Each pod is an ssh ALIAS (pod-<n>) in ~/.ssh/sifter-pods.conf (Include'd by ~/.ssh/config), so `ssh pod-23 …` works
// everywhere `ssh boss …` does. Pure helpers + one tiny file.
import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..', '..');
export const POOL_FILE = process.env.MEDIA_POOL_FILE || join(ROOT, 'data', 'run', 'pool-hosts.json');
export const SSH_CONF = process.env.MEDIA_POOL_SSH_CONF || join(homedir(), '.ssh', 'sifter-pods.conf');
export const GATE_PATH = '/opt/gate/asr-gate.sh';
/** Slots one pod offers per kind (a pod is a 24 GB GPU + many cores; the controller on the pod still pushes back through the gate's df: RAM / disk). */
export const POD_SLOTS = { encode: 4, probe: 3, dfn: 2, grade: 2 };

let cache = { at: 0, hosts: [] };
/** The pod hosts now in the pool → ['pod-23', …]. Cached 5 s; a missing / broken file is an empty pool. */
export function poolHosts(now = Date.now(), file = POOL_FILE) {
  if (now - cache.at < 5_000 && file === POOL_FILE) return cache.hosts;
  let hosts = [];
  try { hosts = (JSON.parse(readFileSync(file, 'utf8')).hosts || []).map((h) => h.host).filter((h) => /^pod-\d+$/.test(h)); } catch { /* no pool */ }
  if (file === POOL_FILE) cache = { at: now, hosts };
  return hosts;
}
export const isPod = (host) => /^pod-\d+$/.test(String(host || ''));

/** ssh config text for the pool (one alias per pod). Pure. */
export function sshConfFor(pods = []) {
  return pods.map((p) => `Host ${p.host}\n  HostName ${p.ip}\n  Port ${p.port}\n  User root\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  LogLevel ERROR\n  ServerAliveInterval 30\n`).join('\n');
}
/** The lane publishes the READY pods: [{ host: 'pod-23', ip, port }] → registry + ssh aliases (atomic writes). */
export function publishPool(pods = [], { file = POOL_FILE, sshConf = SSH_CONF } = {}) {
  const wr = (f, text) => { mkdirSync(dirname(f), { recursive: true }); const t = `${f}.${process.pid}.tmp`; writeFileSync(t, text); renameSync(t, f); };
  wr(sshConf, sshConfFor(pods));
  wr(file, JSON.stringify({ at: Date.now(), hosts: pods.map(({ host, ip, port }) => ({ host, ip, port })) }));
  cache = { at: 0, hosts: [] };
}
export const podName = (p) => `pod-${String(p.name || '').replace(/^\D+/, '') || p.id}`;
