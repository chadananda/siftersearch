// Guard against migrating production from the wrong database (10-12 incident: a scratch worktree read an empty
// ./data/sifter.db while its writes went to the shared writer — migrations 1-20 replayed on production).
import { describe, it, expect } from 'vitest';
import { refuseRoutedJump, MAX_ROUTED_JUMP } from '../../api/lib/migrations/runner.js';

describe('refuseRoutedJump', () => {
  it('refuses a far-behind version when writes go to the shared writer', () => {
    expect(refuseRoutedJump({ from: 0, to: 146, routed: true, force: false })).toBe(true);
    expect(refuseRoutedJump({ from: 20, to: 146, routed: true, force: false })).toBe(true);
  });
  it('lets a normal deploy (a few versions) through', () => {
    expect(refuseRoutedJump({ from: 144, to: 146, routed: true, force: false })).toBe(false);
    expect(refuseRoutedJump({ from: 146 - MAX_ROUTED_JUMP, to: 146, routed: true, force: false })).toBe(false);
  });
  it('a fresh local database (no writer) still builds from zero', () => {
    expect(refuseRoutedJump({ from: 0, to: 146, routed: false, force: false })).toBe(false);
  });
  it('MIGRATE_FORCE overrides', () => {
    expect(refuseRoutedJump({ from: 0, to: 146, routed: true, force: true })).toBe(false);
  });
});
