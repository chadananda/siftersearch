// A whole-recording result carries only what tower adopts (10-31: 1.45 GB per 94-min talk, ~0.9 GB of it working copies).
// Source assertions: the worker image runs these files.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';

const rec = readFileSync('scripts/media/whole-worker/recording.mjs', 'utf8');
const agent = readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8');

it('the worker drops the probe variants and blanks the raw AI copy before writing its manifest', () => {
  const drop = rec.indexOf("'enhanced/light.flac','enhanced/dfn.flac'"), manifest = rec.indexOf("writeFile(join(jobDir,'result.json')");
  expect(drop).toBeGreaterThan(0); expect(drop).toBeLessThan(manifest);
  expect(rec).toMatch(/unipase\.cloud\.flac'\),''\)/);
});
it('the queue agent uploads exactly the files result.json lists for a whole job', () => {
  expect(agent).toMatch(/whole: \{[^\n]*manifest: true/);
  expect(agent).toMatch(/kind\.manifest\s*\n?\s*\? \(JSON\.parse\(readFileSync\(join\(dir, 'result\.json'\)/);
});
