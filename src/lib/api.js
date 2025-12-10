/**
 * API Client for SifterSearch
 * Handles all communication with the backend API
 */

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';
const SESSION_KEY = 'sifter_session_id';

// Token storage
let accessToken = null;
let sessionId = null;

/**
 * Get or create a session ID for anonymous conversation tracking
 */
export function getSessionId() {
  if (sessionId) return sessionId;

  if (typeof localStorage !== 'undefined') {
    sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      // Generate new session ID (nanoid-style)
      sessionId = 'sess_' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }
  return sessionId;
}

/**
 * Check if this is a new session (no previous session ID stored)
 */
export function isNewSession() {
  if (typeof localStorage === 'undefined') return true;
  return !localStorage.getItem(SESSION_KEY);
}

/**
 * Set the access token for authenticated requests
 */
export function setAccessToken(token) {
  accessToken = token;
}

/**
 * Clear the access token (logout)
 */
export function clearAccessToken() {
  accessToken = null;
}

/**
 * Make an API request
 */
async function request(path, options = {}) {
  const url = `${API_URL}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // For refresh token cookie
  });

  // Handle token refresh on 401
  if (response.status === 401 && accessToken) {
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry with new token
      headers['Authorization'] = `Bearer ${accessToken}`;
      const retryResponse = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
      });
      return handleResponse(retryResponse);
    }
  }

  return handleResponse(response);
}

async function handleResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * Refresh the access token using the refresh token cookie
 */
async function refreshToken() {
  try {
    const data = await request('/api/auth/refresh', { method: 'POST' });
    accessToken = data.accessToken;
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

// ============================================
// Auth API
// ============================================

export const auth = {
  async signup(email, password, name) {
    const data = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    accessToken = data.accessToken;
    return data;
  },

  async login(email, password) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    accessToken = data.accessToken;
    return data;
  },

  async logout() {
    await request('/api/auth/logout', { method: 'POST' });
    clearAccessToken();
  },

  async me() {
    return request('/api/auth/me');
  },

  async refresh() {
    return refreshToken();
  }
};

// ============================================
// Search API
// ============================================

export const search = {
  /**
   * Full hybrid search
   */
  async query(query, options = {}) {
    return request('/api/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        limit: options.limit || 20,
        offset: options.offset || 0,
        mode: options.mode || 'hybrid',
        semanticRatio: options.semanticRatio || 0.5,
        filters: options.filters || {}
      })
    });
  },

  /**
   * Quick keyword-only search
   */
  async quick(q, limit = 10) {
    return request(`/api/search/quick?q=${encodeURIComponent(q)}&limit=${limit}`);
  },

  /**
   * Get search index statistics
   */
  async stats() {
    return request('/api/search/stats');
  },

  /**
   * Health check
   */
  async health() {
    return request('/api/search/health');
  },

  /**
   * AI-powered analysis of search results
   * Used when user asks to summarize, analyze, compare, etc.
   */
  async analyze(query, options = {}) {
    return request('/api/search/analyze', {
      method: 'POST',
      body: JSON.stringify({
        query,
        limit: options.limit || 10,
        mode: options.mode || 'hybrid'
      })
    });
  }
};

// ============================================
// Session API
// ============================================

export const session = {
  /**
   * Initialize or resume a session
   * Returns intro message for new sessions
   */
  async init() {
    const isNew = isNewSession();
    const sid = getSessionId();

    return request('/api/session/init', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: sid,
        isNew
      })
    });
  }
};

// ============================================
// Health API
// ============================================

export async function healthCheck() {
  return request('/health');
}

// ============================================
// Default export
// ============================================

export default {
  auth,
  search,
  session,
  healthCheck,
  setAccessToken,
  clearAccessToken,
  getSessionId,
  isNewSession
};
