// setRentalPause / setRentalCapacity (cloud.js): the operator valve behind POST /ops/media/rentals.
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setRentalPause, rentalPauseReason, setRentalCapacity, rentalCapacity } from '../../api/lib/media/cloud.js';

describe('rentals valve', () => {
  it('pauses with a reason and lifts the pause', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'pause-')), 'cloud-rentals.pause');
    expect(await setRentalPause('local first', f)).toBe('local first');
    expect(await rentalPauseReason(f)).toBe('local first');
    expect(await setRentalPause(false, f)).toBeNull();
    expect(existsSync(f)).toBe(false);
    expect(await rentalPauseReason(f)).toBeNull();
  });
  it('caps pods to one and refuses nonsense', async () => {
    const f = join(await mkdtemp(join(tmpdir(), 'cap-')), 'cap.json');
    await setRentalCapacity({ maxPods: 1 }, f);
    expect(await rentalCapacity(3, f)).toBe(1);
    await expect(setRentalCapacity({ maxPods: 0 }, f)).rejects.toThrow(/1-6/);
  });
});
