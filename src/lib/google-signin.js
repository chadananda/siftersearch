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

// Render the "Continue with Google" button into a container (AuthModal).
export async function renderGoogleButton(el) {
  const gsi = await ensureInit();
  if (gsi && el) gsi.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 280 });
}
