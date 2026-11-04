// siftersearch-api runs N pm2 cluster instances (11-03 search speed): once-per-service work runs on instance 0 only,
// the grounding queue never spawns from two processes, cross-request state survives landing on another instance, and the
// coordinator scales a running service to the declared count.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { instanceIndex, runsSingletons } from '../../api/lib/instance.js';
import { signDownloadToken, readDownloadToken } from '../../api/lib/download-token.js';
import { declaredInstances, scaleTarget, idsToRemove } from '../../scripts/lib/instance-drift.mjs';

const root = join(import.meta.dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('instance index (pm2 NODE_APP_INSTANCE)', () => {
  it('unset, 0 or garbage = instance 0, which runs singletons', () => {
    expect(instanceIndex({})).toBe(0);
    expect(runsSingletons({})).toBe(true);
    expect(runsSingletons({ NODE_APP_INSTANCE: '0' })).toBe(true);
    expect(instanceIndex({ NODE_APP_INSTANCE: 'x' })).toBe(0);
  });
  it('any other instance serves only', () => {
    expect(instanceIndex({ NODE_APP_INSTANCE: '3' })).toBe(3);
    expect(runsSingletons({ NODE_APP_INSTANCE: '1' })).toBe(false);
  });
});

describe('once-per-service work is guarded', () => {
  const rt = read('api/lib/api-runtime.js');
  it('api-runtime: migrations, seeding, sync worker and engine features need the singleton instance', () => {
    expect(rt).toMatch(/import \{ runsSingletons \} from '\.\/instance\.js'/);
    expect(rt).toMatch(/const SINGLETON = PRIMARY && runsSingletons\(\)/);
    for (const re of [/SINGLETON \? await runMigrations\(\)/, /SINGLETON \? await seedAdminUser\(\)/, /SINGLETON \? await seedTestUser\(\)/,
      /if \(SINGLETON && config\.search\.enabled\) \{\s*try \{\s*startSyncWorker\(\)/, /SINGLETON && config\.search\.enabled\) ensureEngineFeatures\(\)/]) expect(rt).toMatch(re);
    expect(rt).not.toMatch(/PRIMARY \? await runMigrations/);
  });
  it('grounding: supervisor, processor and stray reaper start on the singleton instance only', () => {
    expect(read('api/routes/grounding.js')).toMatch(/GROUNDING_SUPERVISOR !== '0' && runsSingletons\(\)\) \{\s*await queue\.killStrayGroundingProcs\(\)/);
  });
  it('grounding queue tick, supervisor and processor are no-ops off the singleton instance (2026-08-07 duplicate spawns)', async () => {
    const prev = process.env.NODE_APP_INSTANCE;
    process.env.NODE_APP_INSTANCE = '2';
    try {
      const queue = await import('../../api/lib/pipeline/queue.js');
      expect(await queue.tick()).toEqual({ started: [], busy: -1, skipped: 'not-singleton' });
      expect(queue.startSupervisor()).toBe(null);
      const plan = await import('../../api/lib/pipeline/plan.js');
      expect(plan.startProcessor()).toBe(undefined);
    } finally { if (prev == null) delete process.env.NODE_APP_INSTANCE; else process.env.NODE_APP_INSTANCE = prev; }
  });
});

describe('download links work whichever instance answers (stateless signed token, was an in-process Map)', () => {
  const secret = 's3cret';
  it('round-trips document, format and options', () => {
    const t = signDownloadToken({ documentId: 'abc', format: 'md', options: { includeMetadata: true } }, secret, 1_000);
    expect(readDownloadToken(t, secret, 2_000)).toEqual({ documentId: 'abc', format: 'md', options: { includeMetadata: true } });
  });
  it('refuses expired, tampered or foreign-key tokens', () => {
    const t = signDownloadToken({ documentId: 'abc', format: 'md', options: {} }, secret, 1_000);
    expect(readDownloadToken(t, secret, 1_000 + 15 * 60_000 + 1)).toBe(null);
    expect(readDownloadToken(t, 'other', 2_000)).toBe(null);
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), d: 'xyz' })).toString('base64url');
    expect(readDownloadToken(`${forged}.${sig}`, secret, 2_000)).toBe(null);
    expect(readDownloadToken('garbage', secret, 2_000)).toBe(null);
    expect(readDownloadToken(t, '', 2_000)).toBe(null);
  });
  it('documents.js uses it, not a Map', () => {
    const src = read('api/routes/documents.js');
    expect(src).toMatch(/signDownloadToken/);
    expect(src).not.toMatch(/downloadTokens = new Map/);
  });
});

describe('ecosystem: the search API scales out', () => {
  const config = createRequire(import.meta.url)(join(root, 'ecosystem.config.cjs'));
  const api = config.apps.find((a) => a.name === 'siftersearch-api');
  it('runs 4 cluster instances on one port (pm2 cluster balances; the gateway needs no change)', () => {
    expect(api.exec_mode).toBe('cluster');
    expect(api.instances).toBe(4);
    expect(api.env.API_PORT).toBe('7845');
  });
});

describe('coordinator: a running service converges to its declared instance count', () => {
  it('reads declared instances per app (numbers only; max/-1/absent = not managed)', () => {
    const d = declaredInstances({ apps: [{ name: 'a', instances: 4 }, { name: 'b', instances: 'max' }, { name: 'c' }, { name: 'd', instances: 1 }] });
    expect(d).toEqual({ a: 4, d: 1 });
  });
  it('scale target: declared when the live count differs and something is running; else null', () => {
    expect(scaleTarget(4, 1)).toBe(4);
    expect(scaleTarget(2, 4)).toBe(2);
    expect(scaleTarget(4, 4)).toBe(null);
    expect(scaleTarget(4, 0)).toBe(null);        // not running: startOrReload starts the declared count itself
    expect(scaleTarget(undefined, 1)).toBe(null);
  });
  it('scale-down removes the HIGHEST instance indexes — pm2 scale deletes the first procs, which can be instance 0 (the singleton)', () => {
    const procs = [0, 1, 2, 3].map((i) => ({ pm_id: 10 + i, pm2_env: { NODE_APP_INSTANCE: i } }));
    expect(idsToRemove(procs, 2)).toEqual([13, 12]);
    expect(idsToRemove(procs, 4)).toEqual([]);
    expect(idsToRemove(procs, 0)).toEqual([]);   // never empties a service
  });
  it('update-server scales after a successful startOrReload (pm2 startOrReload never changes the count), then saves', () => {
    const src = read('scripts/update-server.js');
    expect(src).toMatch(/import \{ declaredInstances, scaleTarget, idsToRemove \} from '\.\/lib\/instance-drift\.mjs'/);
    expect(src).toMatch(/startOrReload ecosystem\.config\.cjs --only \$\{name\} --update-env[\s\S]{0,2500}convergeInstances\(name\)/);
    expect(src).toMatch(/pm2 scale \$\{name\} \$\{target\}/);
    expect(src).toMatch(/idsToRemove\(procs, target\)[\s\S]{0,300}pm2 delete \$\{id\}/);
  });
});
