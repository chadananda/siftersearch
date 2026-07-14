// The shared identity-adjudication doctrine — one comparator for every resolver. Pins the discriminative-vs-
// category rule (the Herrigel fix) and asserts all four resolvers embed it, so none can drift on its own.
import { describe, it, expect } from 'vitest';
import { IDENTITY_DOCTRINE } from '../../api/lib/rag/entities/evidence-doctrine.js';
import { SYSTEM as MERGE } from '../../api/lib/rag/entities/merge.js';
import { SYSTEM as DEDUP } from '../../api/lib/rag/entities/dedup-guard.js';
import { SYSTEM as RECONCILE } from '../../api/lib/rag/entities/reconcile.js';
import { SYSTEM as RESEARCH } from '../../api/lib/rag/entities/research-resolve.js';

describe('identity doctrine — the one comparator', () => {
  it('states discriminative vs category, asymmetric names, and the role≠identity trap', () => {
    expect(IDENTITY_DOCTRINE).toMatch(/DISCRIMINATIVE/);
    expect(IDENTITY_DOCTRINE).toMatch(/CATEGORY/);
    expect(IDENTITY_DOCTRINE).toMatch(/nisba/i);
    expect(IDENTITY_DOCTRINE).toMatch(/Covenant-breaker/i);      // named as a category, not identity
    expect(IDENTITY_DOCTRINE).toMatch(/Herrigel/);               // the concrete negative example
    expect(IDENTITY_DOCTRINE).toMatch(/bare common name/i);      // asymmetric rule retained
  });
  it('every resolver embeds the shared doctrine (no drift)', () => {
    for (const S of [MERGE, DEDUP, RECONCILE, RESEARCH]) expect(S).toContain(IDENTITY_DOCTRINE);
  });
});
