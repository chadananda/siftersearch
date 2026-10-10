// Test traffic is recognised from the header (reliable) or a test=1 query/body field.
import { describe, it, expect } from 'vitest';
import { isTestRequest } from '../../api/lib/test-traffic.js';

describe('isTestRequest', () => {
  it('header, query or body marks a request as test; nothing else does', () => {
    expect(isTestRequest({ headers: { 'x-sifter-test': '1' } })).toBe(true);
    expect(isTestRequest({ headers: {}, query: { test: 'true' } })).toBe(true);
    expect(isTestRequest({ headers: {}, body: { test: true } })).toBe(true);
    expect(isTestRequest({ headers: { 'x-sifter-test': '0' }, query: {}, body: { query: 'love' } })).toBe(false);
    expect(isTestRequest({ headers: {} })).toBe(false);
    expect(isTestRequest(undefined)).toBe(false);
  });
});
