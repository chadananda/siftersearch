// Anthropic spend lockdown — the fail-closed allowlist (Persian plan books only) + the static import guard.
// Guards against the leak that billed Sonnet on ~421K non-Persian paragraphs.
import { describe, it, expect } from 'vitest';
import { assertAnthropicAllowed, APPROVED_PERSIAN_DOCS, isAnthropicModel } from '../../api/lib/anthropic-policy.js';
import { findAnthropicViolations } from '../../scripts/check-anthropic-imports.js';

const approvedDoc = [...APPROVED_PERSIAN_DOCS][0];   // a Mázandarání volume (from PROFILE_OVERRIDES lang:'fa')

describe('assertAnthropicAllowed — the ONE approved case: grounding a Persian paragraph of an approved plan book', () => {
  it('ALLOWS Anthropic for lang=fa + an approved (Mázandarání) doc', () => {
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-4-6', lang: 'fa', docId: approvedDoc })).not.toThrow();
  });
  it('REFUSES Anthropic for English (the historical leak — English routed to Sonnet)', () => {
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-4-6', lang: 'en', docId: approvedDoc })).toThrow(/spend policy/i);
  });
  it('REFUSES Anthropic for a Persian doc that is NOT on the approved list (e.g. a misdetected pilgrim note)', () => {
    expect(() => assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', lang: 'fa', docId: 999999 })).toThrow(/spend policy/i);
  });
  it('FAIL-CLOSED: no context (no lang/doc — a non-grounding caller) is refused', () => {
    const err = (() => { try { assertAnthropicAllowed({ provider: 'anthropic', model: 'claude-sonnet-4-6' }); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(Error);
    expect(err.fatal).toBe(true);   // reuses the kernel fatal contract → aborts the run, never partial work
  });
  it('does NOT gate non-Anthropic providers (deepseek/openai pass through untouched)', () => {
    expect(() => assertAnthropicAllowed({ provider: 'deepseek', model: 'deepseek-v4-flash', lang: 'en' })).not.toThrow();
    expect(() => assertAnthropicAllowed({ provider: 'openai', model: 'gpt-4o-mini', lang: 'en' })).not.toThrow();
  });
  it('catches an Anthropic model even if provider is mislabeled (model-name backstop)', () => {
    expect(() => assertAnthropicAllowed({ provider: 'deepseek', model: 'claude-sonnet-4-6', lang: 'en' })).toThrow(/spend policy/i);
  });
  it('approved set is the Mázandarání volumes only (small, explicit)', () => {
    expect(APPROVED_PERSIAN_DOCS.size).toBeGreaterThan(0);
    expect(APPROVED_PERSIAN_DOCS.size).toBeLessThan(20);   // ~9 volumes, never the whole corpus
    expect(isAnthropicModel('claude-sonnet-4-6')).toBe(true);
    expect(isAnthropicModel('deepseek-v4-flash')).toBe(false);
  });
});

describe('static import guard — no ungated Anthropic clients in the runtime surface (api/**)', () => {
  it('finds zero violations (every Anthropic client is sanctioned + gated)', () => {
    expect(findAnthropicViolations()).toEqual([]);
  });
});
