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
        mode: options.mode || 'hybrid',
        useResearcher: options.useResearcher || false
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
  },

  /**
   * Get user's referral statistics
   */
  async getReferralStats() {
    return request('/api/user/referrals');
  }
};

// ============================================
// Admin API
// ============================================

export const admin = {
  /**
   * Get dashboard statistics
   */
  async getStats() {
    return request('/api/admin/stats');
  },

  /**
   * List users with pagination and filtering
   */
  async getUsers(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    if (options.tier) params.set('tier', options.tier);
    if (options.search) params.set('search', options.search);
    return request(`/api/admin/users?${params.toString()}`);
  },

  /**
   * Get users pending approval
   */
  async getPending() {
    return request('/api/admin/pending');
  },

  /**
   * Update a user
   */
  async updateUser(id, updates) {
    return request(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Approve a user
   */
  async approveUser(id) {
    return request(`/api/admin/approve/${id}`, {
      method: 'POST'
    });
  },

  /**
   * Ban a user
   */
  async banUser(id) {
    return request(`/api/admin/ban/${id}`, {
      method: 'POST'
    });
  },

  /**
   * Get analytics events
   */
  async getAnalytics(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.eventType) params.set('eventType', options.eventType);
    return request(`/api/admin/analytics?${params.toString()}`);
  }
};

// ============================================
// Librarian API (Document Ingestion)
// ============================================

export const librarian = {
  /**
   * Get queue statistics
   */
  async getStats() {
    return request('/api/librarian/stats');
  },

  /**
   * List queue items
   */
  async getQueue(options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    return request(`/api/librarian/queue?${params.toString()}`);
  },

  /**
   * Get queue item details
   */
  async getQueueItem(id) {
    return request(`/api/librarian/queue/${id}`);
  },

  /**
   * Add document to queue (upload, URL, or ISBN)
   */
  async addToQueue(data) {
    return request('/api/librarian/queue', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Update queue item (approve/reject/analyze/process)
   */
  async updateQueueItem(id, action, data = {}) {
    return request(`/api/librarian/queue/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ action, ...data })
    });
  },

  /**
   * Delete queue item
   */
  async deleteQueueItem(id) {
    return request(`/api/librarian/queue/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * Upload a file to the queue
   */
  async uploadFile(file, options = {}) {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line no-undef
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const result = await librarian.addToQueue({
            source_type: 'upload',
            file_data: base64,
            file_name: file.name,
            content_type: file.type,
            religion: options.religion,
            collection: options.collection
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Add URL to queue
   */
  async addUrl(url, options = {}) {
    return librarian.addToQueue({
      source_type: 'url',
      url,
      religion: options.religion,
      collection: options.collection
    });
  },

  /**
   * Add ISBN to queue
   */
  async addIsbn(isbn, options = {}) {
    return librarian.addToQueue({
      source_type: 'isbn',
      isbn,
      religion: options.religion,
      collection: options.collection
    });
  },

  /**
   * Analyze document content
   */
  async analyze(content, options = {}) {
    return request('/api/librarian/analyze', {
      method: 'POST',
      body: JSON.stringify({ content, ...options })
    });
  },

  /**
   * Look up ISBN
   */
  async lookupIsbn(isbn) {
    return request('/api/librarian/lookup-isbn', {
      method: 'POST',
      body: JSON.stringify({ isbn })
    });
  },

  /**
   * Check for duplicates
   */
  async checkDuplicates(content, threshold = 0.85) {
    return request('/api/librarian/check-duplicates', {
      method: 'POST',
      body: JSON.stringify({ content, threshold })
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
// Services API (Translation, Audio)
// ============================================

export const services = {
  /**
   * Get supported translation languages
   */
  async getLanguages() {
    return request('/api/services/translate/languages');
  },

  /**
   * Request document translation (patron+ only)
   */
  async requestTranslation(documentId, targetLanguage, options = {}) {
    return request('/api/services/translate', {
      method: 'POST',
      body: JSON.stringify({
        documentId,
        targetLanguage,
        sourceLanguage: options.sourceLanguage,
        quality: options.quality || 'standard',
        notifyEmail: options.notifyEmail
      })
    });
  },

  /**
   * Check translation job status
   */
  async getTranslationStatus(jobId) {
    return request(`/api/services/translate/status/${jobId}`);
  },

  /**
   * Check if translation exists for document
   */
  async checkTranslation(documentId, targetLanguage) {
    return request(`/api/services/translate/check/${documentId}?lang=${targetLanguage}`);
  },

  /**
   * Get available TTS voices
   */
  async getVoices() {
    return request('/api/services/audio/voices');
  },

  /**
   * Request audio conversion (patron+ only)
   */
  async requestAudio(documentId, options = {}) {
    return request('/api/services/audio', {
      method: 'POST',
      body: JSON.stringify({
        documentId,
        voiceId: options.voiceId,
        format: options.format || 'mp3',
        notifyEmail: options.notifyEmail
      })
    });
  },

  /**
   * Check audio job status
   */
  async getAudioStatus(jobId) {
    return request(`/api/services/audio/status/${jobId}`);
  },

  /**
   * Check if audio exists for document
   */
  async checkAudio(documentId) {
    return request(`/api/services/audio/check/${documentId}`);
  },

  /**
   * Get user's jobs (translation and audio)
   */
  async getJobs(options = {}) {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', options.limit);
    return request(`/api/services/jobs?${params.toString()}`);
  },

  /**
   * Download completed job result
   */
  getDownloadUrl(jobId) {
    return `${API_URL}/api/services/download/${jobId}`;
  }
};

// ============================================
// Forum API
// ============================================

export const forum = {
  /**
   * Get list of forum posts
   */
  async getPosts(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    if (options.sort) params.set('sort', options.sort);
    if (options.category) params.set('category', options.category);
    const query = params.toString();
    return request(`/api/forum/posts${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single post with replies
   */
  async getPost(postId) {
    return request(`/api/forum/posts/${postId}`);
  },

  /**
   * Create a new post
   */
  async createPost(title, content, category = 'general') {
    return request('/api/forum/posts', {
      method: 'POST',
      body: JSON.stringify({ title, content, category })
    });
  },

  /**
   * Reply to a post
   */
  async replyToPost(postId, content) {
    return request(`/api/forum/posts/${postId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },

  /**
   * Update a post
   */
  async updatePost(postId, updates) {
    return request(`/api/forum/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  /**
   * Delete a post
   */
  async deletePost(postId) {
    return request(`/api/forum/posts/${postId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Vote on a post
   */
  async votePost(postId, vote) {
    return request(`/api/forum/posts/${postId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote })
    });
  },

  /**
   * Get forum categories
   */
  async getCategories() {
    return request('/api/forum/categories');
  }
};

// ============================================
// Default export
// ============================================

export default {
  auth,
  search,
  documents,
  session,
  user,
  admin,
  librarian,
  services,
  forum,
  healthCheck,
  triggerServerUpdate,
  setAccessToken,
  clearAccessToken,
  getSessionId,
  isNewSession
};
