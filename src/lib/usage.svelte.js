/**
 * Usage State Management
 * Tracks query limits and remaining searches
 */

// Usage state - updated when search completes
let remaining = $state(null);
let limit = $state(null);
let isAuthenticated = $state(false);

/**
 * Update usage from search response
 */
export function updateUsage(queryLimit) {
  if (queryLimit) {
    remaining = queryLimit.remaining;
    limit = queryLimit.limit;
    isAuthenticated = queryLimit.isAuthenticated;
  }
}

/**
 * Reset usage (on logout)
 */
export function resetUsage() {
  remaining = null;
  limit = null;
  isAuthenticated = false;
}

/**
 * Get current usage state
 */
export function getUsageState() {
  return {
    get remaining() { return remaining; },
    get limit() { return limit; },
    get isAuthenticated() { return isAuthenticated; },
    get hasData() { return remaining !== null; }
  };
}

export default {
  updateUsage,
  resetUsage,
  getUsageState
};
