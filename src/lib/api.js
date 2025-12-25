/**
 * API Client for SifterSearch
 * Handles all communication with the backend API
 */

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';
const USER_ID_KEY = 'sifter_user_id';
const SESSION_KEY = 'sifter_session_id'; // Keep for backwards compatibility

// Token storage
let accessToken = null;
let userId = null;

/**
 * Get or create a persistent user ID for anonymous user tracking.
 * This ID persists across sessions and is used to store preferences,
 * interests, and chat history in the backend database.
 */
export function getUserId() {
  if (userId) return userId;

  // Check for browser environment with proper localStorage API
  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    try {
      // Try new key first, fall back to old session key for migration
      userId = localStorage.getItem(USER_ID_KEY) || localStorage.getItem(SESSION_KEY);
      if (!userId) {
        // Generate new user ID (UUID v4 style)
        userId = 'user_' + crypto.randomUUID();
      }
      // Always store under new key (migrates old session IDs)
      localStorage.setItem(USER_ID_KEY, userId);
    } catch (e) {
      // localStorage might throw in some environments
      userId = null;
    }
  }
  return userId;
}

/**
 * Get or create a session ID for anonymous conversation tracking
 * @deprecated Use getUserId() instead for persistent tracking
 */
export function getSessionId() {
  return getUserId();
}

/**
 * Check if this is a new user (no previous user ID stored)
 */
export function isNewUser() {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return true;
  try {
    return !localStorage.getItem(USER_ID_KEY) && !localStorage.getItem(SESSION_KEY);
  } catch (e) {
    return true;
  }
}

/**
 * Check if this is a new session (no previous session ID stored)
 * @deprecated Use isNewUser() instead
 */
export function isNewSession() {
  return isNewUser();
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

// Client version - set by build process via Vite define
// eslint-disable-next-line no-undef
const CLIENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;

/**
 * Make an API request
 */
async function request(path, options = {}) {
  const url = `${API_URL}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Always send user ID for anonymous user tracking
  const uid = getUserId();
  if (uid) {
    headers['X-User-ID'] = uid;
  }

  // Always send client version for auto-update detection
  if (CLIENT_VERSION) {
    headers['X-Client-Version'] = CLIENT_VERSION;
  }

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
 * Silently returns false if no refresh token exists (anonymous users)
 */
async function refreshToken() {
  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      // Expected for anonymous users - no refresh token
      clearAccessToken();
      return false;
    }

    const data = await response.json();
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
  async signup(email, password, name, referralCode = null) {
    const data = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, referralCode })
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
  },

  /**
   * Streaming AI-powered analysis of search results
   * Returns an async generator that yields events
   * Event types: 'sources', 'chunk', 'complete', 'error'
   */
  async *analyzeStream(query, options = {}) {
    const url = `${API_URL}/api/search/analyze/stream`;

    // Build headers - include X-User-ID for anonymous tracking
    const headers = {
      'Content-Type': 'application/json'
    };

    // Always send user ID for anonymous user tracking
    const uid = getUserId();
    if (uid) {
      headers['X-User-ID'] = uid;
    }

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        limit: options.limit || 10,
        mode: options.mode || 'hybrid'
      })
      // Note: credentials: 'include' removed - not needed and causes CORS issues
      // when server returns Access-Control-Allow-Origin: *
    });

    if (!response.ok) {
      const error = new Error('Stream request failed');
      error.status = response.status;
      throw error;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (split on double newline)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          // Each message may have multiple lines (event:, data:, etc.)
          // We only care about lines starting with "data: "
          const lines = message.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6).trim();
                if (jsonStr) {
                  const data = JSON.parse(jsonStr);
                  yield data;
                }
              } catch (e) {
                console.warn('SSE parse warning:', e.message, 'Line:', line);
              }
            }
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (jsonStr) {
                const data = JSON.parse(jsonStr);
                yield data;
              }
            } catch (e) {
              // Ignore incomplete data at end
            }
          }
        }
      }
    } finally {
      // Ensure reader is released
      reader.releaseLock();
    }
  }
};

// ============================================
// Documents API
// ============================================

export const documents = {
  /**
   * Get document metadata by ID
   */
  async get(documentId) {
    return request(`/api/documents/${encodeURIComponent(documentId)}`);
  },

  /**
   * Get all segments/paragraphs for a document
   * Returns segments sorted by paragraph_index
   */
  async getSegments(documentId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    const queryString = params.toString();
    const url = `/api/documents/${encodeURIComponent(documentId)}/segments${queryString ? `?${queryString}` : ''}`;
    return request(url);
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
// User API
// ============================================

export const user = {
  /**
   * Get current user profile
   */
  async getProfile() {
    return request('/api/user/profile');
  },

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    return request('/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword) {
    return request('/api/user/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  /**
   * Delete account
   */
  async deleteAccount() {
    return request('/api/user', {
      method: 'DELETE'
    });
  },

  /**
   * Get user's conversation history
   */
  async getConversations(limit = 20, offset = 0) {
    return request(`/api/user/conversations?limit=${limit}&offset=${offset}`);
  }
};

// ============================================
// Health API
// ============================================

export async function healthCheck() {
  return request('/health');
}

// ============================================
// Deploy API
// ============================================

const DEPLOY_SECRET = import.meta.env.PUBLIC_DEPLOY_SECRET || '';

/**
 * Trigger server update when client detects version mismatch
 */
export async function triggerServerUpdate(clientVersion) {
  if (!DEPLOY_SECRET) {
    console.log('[Deploy] No deploy secret configured, skipping update trigger');
    return { skipped: true };
  }

  try {
    const response = await fetch(`${API_URL}/api/deploy/trigger-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: DEPLOY_SECRET,
        clientVersion
      })
    });

    if (response.ok) {
      console.log('[Deploy] Server update triggered successfully');
      return await response.json();
    } else {
      console.warn('[Deploy] Failed to trigger update:', response.status);
      return { error: response.status };
    }
  } catch (err) {
    console.warn('[Deploy] Error triggering update:', err.message);
    return { error: err.message };
  }
}

// ============================================
// Default export
// ============================================

export default {
  auth,
  search,
  documents,
  session,
  healthCheck,
  triggerServerUpdate,
  setAccessToken,
  clearAccessToken,
  getSessionId,
  isNewSession
};
