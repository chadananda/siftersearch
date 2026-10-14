// Backup staging: verify on NVMe only when the stage pool has room for the copy plus headroom.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { stageFor } from '../../api/lib/backup.js';

describe('stageFor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stage-'));
  it('no stage dir configured → old path', () => expect(stageFor('', 1e9, 1e12)).toBe(null));
  it('room for 1.15× the db + 30GB → stage there', () => expect(stageFor(dir, 53e9, 118e9)).toBe(dir));
  it('not enough room → old path, never a full pool', () => expect(stageFor(dir, 80e9, 118e9)).toBe(null));
});
