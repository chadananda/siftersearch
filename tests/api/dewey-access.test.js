// Dewey access rule: admins always; other members only when granted on /admin/users (users.dewey_access); never banned.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/db.js', () => ({ userQuery: vi.fn(), userQueryOne: vi.fn() }));
import { canUseDewey } from '../../api/lib/auth.js';

describe('canUseDewey', () => {
  it('admins yes; granted members yes; others and banned no', () => {
    expect(canUseDewey({ tier: 'admin' })).toBe(true);
    expect(canUseDewey({ tier: 'approved', dewey_access: 1 })).toBe(true);
    expect(canUseDewey({ tier: 'approved', dewey_access: 0 })).toBe(false);
    expect(canUseDewey({ tier: 'verified' })).toBe(false);
    expect(canUseDewey({ tier: 'banned', dewey_access: 1 })).toBe(false);
    expect(canUseDewey(null)).toBe(false);
  });
});
