/**
 * Auth State Management
 * Simple reactive auth store for Svelte
 */

import { auth as authApi } from './api.js';

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
 */
export async function logout() {
  try {
    await authApi.logout();
  } catch {
    // Ignore errors
  } finally {
    user = null;
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
