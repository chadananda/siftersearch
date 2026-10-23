// Google Identity Services loader for the SITE (One Tap + button). The widget has its own
// intermediate-iframe flow; this is for siftersearch.com itself. Deps: PUBLIC_GOOGLE_CLIENT_ID.
import { googleLogin } from './auth.svelte.js';

const CLIENT_ID = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID;
let loading = null;

export function loadGsi() {
  if (typeof window === 'undefined' || !CLIENT_ID) return Promise.resolve(null);
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  loading ||= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google?.accounts?.id || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loading;
}

async function onCredential(resp) {
  if (resp?.credential) await googleLogin(resp.credential);
}

let initialized = false;
async function ensureInit() {
  const gsi = await loadGsi();
  if (!gsi) return null;
  if (!initialized) {
    gsi.initialize({ client_id: CLIENT_ID, callback: onCredential, use_fedcm_for_prompt: true, cancel_on_tap_outside: true, itp_support: true });
    initialized = true;
  }
  return gsi;
}

// One Tap prompt for signed-out visitors — once per browser session (Google applies its own cooldowns
// too). `force` is for a prompt the visitor ASKED for (e.g. "Connect" in the chat): their own click
// must not be swallowed by the drive-by cooldown.
export async function promptOneTap({ force = false } = {}) {
  try {
    if (!force && sessionStorage.getItem('gsi_prompted')) return;
    sessionStorage.setItem('gsi_prompted', '1');
  } catch { /* private mode */ }
  const gsi = await ensureInit();
  gsi?.prompt();
}

// Site theme: data-theme on <html>, or the OS preference when the attribute is absent ("system").
export function siteIsDark() {
  if (typeof document === 'undefined') return false;
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

// Calls cb when the site theme flips (ThemeToggle sets data-theme; "system" follows the OS). Returns an unsubscribe.
export function onSiteThemeChange(cb) {
  if (typeof document === 'undefined') return () => {};
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(cb) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener?.('change', cb);
  return () => { mo?.disconnect(); mq?.removeEventListener?.('change', cb); };
}

// Render the "Continue with Google" button into a container (AuthModal, guest menu). Theme follows the
// site: 'filled_black' on dark, 'outline' on light (a white button on the dark panel clashed, Chad 10-22).
// Re-renders only when width or theme changed, so repeated calls are cheap.
export async function renderGoogleButton(el, { width = 280 } = {}) {
  const gsi = await ensureInit();
  if (!gsi || !el) return;
  const theme = siteIsDark() ? 'filled_black' : 'outline';
  const key = `${width}|${theme}`;
  if (el.childElementCount && el.dataset?.gsiKey === key) return;
  if (el.childElementCount) el.innerHTML = '';
  if (el.dataset) el.dataset.gsiKey = key;
  if (el.style) el.style.width = `${width}px`; // the host is clipped to exactly the button's pill
  gsi.renderButton(el, { type: 'standard', theme, size: 'large', text: 'continue_with', shape: 'pill', width });
}
