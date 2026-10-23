// Guest clicking the account pill must present sign-in (Chad 10-22). One Tap was silently SKIPPED on
// production ('unknown_reason' — FedCM / cooldown), and the menu offered only a small "Connect Free"
// row. Now: forced One Tap + a rendered Google button + email in the menu.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../src/lib/auth.svelte.js', () => ({ googleLogin: vi.fn() }));

let gsi, mod, store;
beforeEach(async () => {
  vi.resetModules();
  store = new Map([['gsi_prompted', '1']]);
  vi.stubGlobal('sessionStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  gsi = { initialize: vi.fn(), prompt: vi.fn(), renderButton: vi.fn((el) => { el.childElementCount = 1; }) };
  vi.stubGlobal('window', { google: { accounts: { id: gsi } } });
  vi.stubEnv('PUBLIC_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
  mod = await import('../../src/lib/google-signin.js');
});

describe('guest sign-in', () => {
  it('a forced prompt (the visitor clicked) bypasses the once-per-session guard', async () => {
    await mod.promptOneTap();
    expect(gsi.prompt).not.toHaveBeenCalled();
    await mod.promptOneTap({ force: true });
    expect(gsi.prompt).toHaveBeenCalledTimes(1);
  });

  it('renders the Google button at the requested width, once per element', async () => {
    const el = { childElementCount: 0 };
    await mod.renderGoogleButton(el, { width: 240 });
    await mod.renderGoogleButton(el, { width: 240 });
    expect(gsi.renderButton).toHaveBeenCalledTimes(1);
    expect(gsi.renderButton.mock.calls[0][1]).toMatchObject({ width: 240, text: 'continue_with' });
  });

  it('the NavBar guest menu forces One Tap AND offers a Google button and email', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/common/NavBar.svelte'), 'utf8');
    expect(src).toMatch(/onclick=\{toggleNavMenu\}/);
    expect(src).toMatch(/promptOneTap\(\{ force: true \}\)/);
    expect(src).toMatch(/bind:this=\{guestGoogleEl\}/);
    expect(src).toMatch(/renderGoogleButton\(guestGoogleEl/);
    expect(src).toMatch(/Sign in with email/);
  });
});
