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

/**
 * Initialize auth state - check if user is logged in
 */
export async function initAuth() {
  loading = true;
  error = null;

  try {
    // Try to refresh token and get user
    const refreshed = await authApi.refresh();
    if (refreshed) {
      const data = await authApi.me();
      user = data.user;
    }
  } catch (err) {
    // Not logged in or token expired
    user = null;
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
    user = data.user;
    return { success: true };
  } catch (err) {
    error = err.message || 'Login failed';
    return { success: false, error: error };
  } finally {
    loading = false;
  }
}

/**
 * Signup
 */
export async function signup(email, password, name) {
  loading = true;
  error = null;

  try {
    const data = await authApi.signup(email, password, name);
    user = data.user;
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
    user = null;
    // Generate a fresh anonymous user ID for the logged-out session
    if (typeof localStorage !== 'undefined') {
      const newUserId = 'user_' + crypto.randomUUID();
      localStorage.setItem(USER_ID_KEY, newUserId);
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

export default {
  initAuth,
  login,
  signup,
  logout,
  getAuthState
};
