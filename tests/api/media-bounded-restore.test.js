import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
it('overlap trimming covers every sample once, including short inputs and long-recording tails', () => {
  const result = execFileSync('python3', ['-c', `
from scripts.media.worker.long_restore import patch_bounds
for frames in list(range(1, 240)) + [5655*10, 5656*10, 5657*10]:
    bounds = patch_bounds(frames, 10)
    covered = []
    for i, (start, end) in enumerate(bounds):
        left = start + (0 if i == 0 else 20)
        right = end if i == len(bounds)-1 else start+60
        covered += list(range(left, right))
    assert covered == list(range(frames)), (frames, bounds)
    assert max(e-s for s,e in bounds) <= 100
print('ok')`], { encoding: 'utf8' });
  expect(result.trim()).toBe('ok');
});
