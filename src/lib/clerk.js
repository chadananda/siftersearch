// src/lib/clerk.js
import { PUBLIC_CLERK_PUBLISHABLE_KEY } from '$env/static/public';
import { createClerkClient } from '@clerk/clerk-js';

/**
 * Initialize Clerk client for browser usage
 * @returns {Promise<Object>} Clerk client instance
 */
export async function initClerk() {
  if (typeof window === 'undefined') {
    return null;
  }

  const clerk = createClerkClient({
    publishableKey: PUBLIC_CLERK_PUBLISHABLE_KEY
  });

  await clerk.load();
  return clerk;
}

/**
 * Get current user from Clerk
 * @param {Object} clerk - Clerk client instance
 * @returns {Object|null} Current user or null if not authenticated
 */
export function getCurrentUser(clerk) {
  if (!clerk || !clerk.user) {
    return null;
  }
  
  return clerk.user;
}

/**
 * Sign out the current user
 * @param {Object} clerk - Clerk client instance
 * @returns {Promise<void>}
 */
export async function signOut(clerk) {
  if (!clerk) {
    return;
  }
  
  await clerk.signOut();
  window.location.href = '/';
}

/**
 * Get the current session token
 * @param {Object} clerk - Clerk client instance
 * @returns {Promise<string|null>} Session token or null if not authenticated
 */
export async function getSessionToken(clerk) {
  if (!clerk || !clerk.session) {
    return null;
  }
  
  return clerk.session.getToken();
}
