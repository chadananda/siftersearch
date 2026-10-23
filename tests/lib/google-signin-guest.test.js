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
    const el = { childElementCount: 0, dataset: {} };
    await mod.renderGoogleButton(el, { width: 240 });
    await mod.renderGoogleButton(el, { width: 240 });
    expect(gsi.renderButton).toHaveBeenCalledTimes(1);
    expect(gsi.renderButton.mock.calls[0][1]).toMatchObject({ width: 240, text: 'continue_with' });
    // a resize to a narrower panel re-renders at the new width
    await mod.renderGoogleButton(el, { width: 210 });
    expect(gsi.renderButton).toHaveBeenCalledTimes(2);
    expect(gsi.renderButton.mock.calls[1][1].width).toBe(210);
  });

  it('the button theme follows the site: filled_black on dark, outline on light, re-rendered on a flip', async () => {
    let theme = 'dark';
    vi.stubGlobal('document', { documentElement: { getAttribute: () => theme } });
    const el = { childElementCount: 0, dataset: {} };
    await mod.renderGoogleButton(el, { width: 240 });
    expect(gsi.renderButton.mock.calls[0][1]).toMatchObject({ theme: 'filled_black', shape: 'pill' });
    theme = 'light';
    await mod.renderGoogleButton(el, { width: 240 });
    expect(gsi.renderButton.mock.calls[1][1]).toMatchObject({ theme: 'outline', shape: 'pill' });
    await mod.renderGoogleButton(el, { width: 240 });
    expect(gsi.renderButton).toHaveBeenCalledTimes(2);
    const src = readFileSync(resolve(__dirname, '../../src/components/common/NavBar.svelte'), 'utf8');
    expect(src).toMatch(/onSiteThemeChange\(fit\)/);
    expect(src).toMatch(/\.guest-google-slot \{[^}]*color-scheme: light/);
    // clipped to exactly the button's pill: an opaque personalised-iframe canvas cannot show around it
    expect(src).toMatch(/\.guest-google-slot \{[^}]*height: 40px[^}]*border-radius: 20px[^}]*overflow: hidden/);
    const host = { childElementCount: 0, dataset: {}, style: {} };
    await mod.renderGoogleButton(host, { width: 252 });
    expect(host.style.width).toBe('252px');
  });

  it('the menu is right-aligned to the pill and capped to the viewport (was centred → clipped on the right)', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/common/NavBar.svelte'), 'utf8');
    const css = src.match(/\.nav-dropdown \{[^}]*\}/)[0];
    expect(css).toMatch(/right: 0/);
    expect(css).toMatch(/max-width: calc\(100vw - 32px\)/);
    expect(css).not.toMatch(/translateX\(-50%\)/);
  });

  it('the NavBar guest menu forces One Tap AND offers a Google button and email', () => {
    const src = readFileSync(resolve(__dirname, '../../src/components/common/NavBar.svelte'), 'utf8');
    expect(src).toMatch(/onclick=\{toggleNavMenu\}/);
    expect(src).toMatch(/promptOneTap\(\{ force: true \}\)/);
    expect(src).toMatch(/bind:this=\{guestGoogleEl\}/);
    expect(src).toMatch(/renderGoogleButton\(el, \{ width:/);
    expect(src).toMatch(/Sign in with email/);
  });
});
