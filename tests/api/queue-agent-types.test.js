// queue-agent.mjs typed flags: --types (preference order) + --spill + contract go in the claim; --device none only for CPU-only types.
// Runs the real agent (--once) against a stub queue that records the claim and hands out nothing.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const AGENT = 'scripts/media/worker/queue-agent.mjs';
function runAgent(args) {
  return new Promise((resolve) => {
    const claims = [];
    const srv = createServer((req, res) => {
      let b = ''; req.on('data', (c) => { b += c; });
      req.on('end', () => { if (req.url.endsWith('/claim')) claims.push(JSON.parse(b)); res.statusCode = 204; res.end(); });
    }).listen(0, '127.0.0.1', () => {
      const env = { ...process.env, MEDIA_QUEUE_KEY: 'k', MEDIA_QUEUE_URL: `http://127.0.0.1:${srv.address().port}` };
      const p = spawn(process.execPath, [AGENT, '--host', 't', '--run', 'local', '--root', '/tmp/qa-test', '--once', ...args], { env });
      let out = ''; p.stdout.on('data', (c) => { out += c; }); p.stderr.on('data', (c) => { out += c; });
      p.on('close', (code) => { srv.close(); resolve({ code, out, claims }); });
    });
  });
}

describe('queue agent typed flags', () => {
  it('Boss: --types cpu-prep,cpu-finish --device none claims those types in order, with the contract and no VRAM', async () => {
    const r = await runAgent(['--types', 'cpu-finish,cpu-prep', '--device', 'none']);
    expect(r.code).toBe(0);
    expect(r.claims[0]).toMatchObject({ host: 't', types: ['cpu-finish', 'cpu-prep'], spill: [], spill_only: false, contract: 1, vram_mb: 0 });
    expect(r.claims[0].can).toBeUndefined();
  }, 20_000);
  it('--device none is refused when a listed type needs the GPU (no CPU fallback)', async () => {
    const r = await runAgent(['--types', 'gpu', '--device', 'none']);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/GPU stages never run on CPU/);
    expect(r.claims).toEqual([]);
  }, 20_000);
  it('Aorus: --types gpu --spill cpu-prep,cpu-finish sends the spill list; --vram-mb overrides detection', async () => {
    const r = await runAgent(['--types', 'gpu', '--spill', 'cpu-prep,cpu-finish', '--device', 'cuda', '--vram-mb', '24000']);
    expect(r.code).toBe(0);
    expect(r.claims[0]).toMatchObject({ types: ['gpu'], spill: ['cpu-prep', 'cpu-finish'], vram_mb: 24000 });
  }, 20_000);
  it('an unknown type is refused', async () => {
    const r = await runAgent(['--types', 'gpu-everything', '--device', 'cuda']);
    expect(r.code).toBe(2);
  }, 20_000);
  it('legacy flags still claim by --can', async () => {
    const r = await runAgent(['--can', 'whole', '--device', 'cuda']);
    expect(r.code).toBe(0);
    expect(r.claims[0]).toMatchObject({ can: ['whole'] });
    expect(r.claims[0].types).toBeUndefined();
  }, 20_000);
});
