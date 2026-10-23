/**
 * Auth State Management
 * Simple reactive auth store for Svelte
 */

import { auth as authApi, getUserId } from './api.js';

const USER_ID_KEY = 'sifter_user_id';

// Auth state
let user = $state(null);
let loading = $state(true);
let error = $state(null);

// Last user the server confirmed, so a page load during an outage shows who you are rather than
// "Connect Free". Display only — it grants nothing; the API still requires the cookie/token.
const LAST_USER_KEY = 'sifter_last_user';

function readLastUser() {
  try { return JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null'); } catch { return null; }
}
function rememberUser(u) {
  try {
    if (u) localStorage.setItem(LAST_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch { /* storage unavailable */ }
}
function setUser(u) {
  user = u;
  rememberUser(u);
}

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60000;
let initInFlight = null;
let retryTimer = null;
let retryAttempt = 0;
let onlineListener = null;

function scheduleRetry() {
  if (typeof window === 'undefined' || retryTimer) return;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, retryAttempt++));
  retryTimer = setTimeout(() => { retryTimer = null; initAuth(); }, delay);
  if (!onlineListener && typeof window.addEventListener === 'function') {
    onlineListener = () => {
      clearTimeout(retryTimer); retryTimer = null;
      initAuth();
    };
    window.addEventListener('online', onlineListener);
  }
}
function stopRetrying() {
  clearTimeout(retryTimer); retryTimer = null; retryAttempt = 0;
  if (onlineListener && typeof window !== 'undefined') window.removeEventListener?.('online', onlineListener);
  onlineListener = null;
}

/**
 * Initialize auth state - check if user is logged in.
 * Always attempts refresh since httpOnly cookies aren't visible to JavaScript.
 * Signs the user out ONLY on an authoritative 400/401/403 from our API. A network error, 5xx,
 * Cloudflare 530/52x or timeout means "unknown": keep the last known user and retry with backoff.
 * Concurrent callers (NavBar, ChatInterface, admin pages) share one check.
 */
export function initAuth() {
  if (!initInFlight) initInFlight = runInitAuth().finally(() => { initInFlight = null; });
  return initInFlight;
}

async function runInitAuth() {
  if (!user) loading = true;
  error = null;

  try {
    const status = await authApi.refreshStatus();
    if (status === 'denied') {
      setUser(null);
      stopRetrying();
      return;
    }
    if (status === 'transient') {
      if (!user) user = readLastUser();
      scheduleRetry();
      return;
    }
    try {
      const data = await authApi.me();
      setUser(data.user);
      stopRetrying();
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        setUser(null);
        stopRetrying();
      } else {
        if (!user) user = readLastUser();
        scheduleRetry();
      }
    }
  } finally {
    loading = false;
  }
}

/**
 * Login
 * Note: The anonymous user ID in localStorage is preserved until logout.
 * This ensures the X-User-ID header continues to be sent for any pending
 * unification requests. The server handles linking the anonymous data
 * to the authenticated account.
 */
export async function login(email, password) {
  loading = true;
  error = null;

  try {
    const data = await authApi.login(email, password);
    setUser(data.user);
    return { success: true };
  } catch (err) {
    error = err.message || 'Login failed';
    return { success: false, error: error };
  } finally {
    loading = false;
  }
}

/**
 * Google sign-in (One Tap or button credential) — same session as email login.
 */
export async function googleLogin(credential) {
  loading = true;
  error = null;
  try {
    const data = await authApi.google(credential);
    setUser(data.user);
    return { success: true };
  } catch (err) {
    error = err.message || 'Google sign-in failed';
    return { success: false, error };
  } finally {
    loading = false;
  }
}

/**
 * Signup
 */
export async function signup(email, password, name, referralCode = null) {
  loading = true;
  error = null;

  try {
    const data = await authApi.signup(email, password, name, referralCode);
    setUser(data.user);
    return { success: true };
  } catch (err) {
    error = err.message || 'Signup failed';
    return { success: false, error: error };
  } finally {
    loading = false;
  }
}

/**
 * Logout
 * Clears the user session and generates a fresh anonymous user ID.
 * This ensures the user starts fresh after logout.
 */
export async function logout() {
  try {
    await authApi.logout();
  } catch {
    // Ignore errors
  } finally {
    setUser(null);
    stopRetrying();
    // Generate a fresh anonymous user ID for the logged-out session
    if (typeof localStorage !== 'undefined') {
      const newUserId = 'user_' + crypto.randomUUID();
      localStorage.setItem(USER_ID_KEY, newUserId);
    }
    // Redirect to home page after logout
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }
}

/**
 * Get current auth state
 */
export function getAuthState() {
  return {
    get user() { return user; },
    get loading() { return loading; },
    get error() { return error; },
    get isAuthenticated() { return !!user; }
  };
}

/**
 * Route guard - redirects to home if not authenticated
 * Call this in onMount or as an effect in protected components
 * @param {string} redirectTo - URL to redirect to (default: '/')
 * @returns {boolean} - true if authenticated, false if redirecting
 */
export function requireAuth(redirectTo = '/') {
  // Skip during SSR
  if (typeof window === 'undefined') return true;

  // Wait for auth to initialize
  if (loading) return true;

  // Redirect if not authenticated
  if (!user) {
    window.location.href = redirectTo;
    return false;
  }

  return true;
}

/**
 * Check if user has required tier
 * @param {string|string[]} allowedTiers - tier(s) required
 * @param {string} redirectTo - URL to redirect to if unauthorized
 * @returns {boolean} - true if authorized
 */
export function requireTier(allowedTiers, redirectTo = '/') {
  if (typeof window === 'undefined') return true;
  if (loading) return true;

  if (!user) {
    window.location.href = redirectTo;
    return false;
  }

  const tiers = Array.isArray(allowedTiers) ? allowedTiers : [allowedTiers];
  if (!tiers.includes(user.tier)) {
    window.location.href = redirectTo;
    return false;
  }

  return true;
}

export default {
  initAuth,
  login,
  signup,
  logout,
  getAuthState,
  requireAuth,
  requireTier
};
