// src/lib/api/utils.js
import { error } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

// Database connection cache
const dbConnections = {
  app: null,
  library: null
};

/**
 * Get a database connection
 * @param {string} dbName - Name of the database to connect to (app, library)
 * @returns {object} Database client
 */
export async function getDb(dbName = 'app') {
  // This is a placeholder function that would be replaced with your actual database connection logic
  // Since we're no longer using libsql, you'll need to implement your preferred database connection here
  
  // For now, we'll return a mock client with execute method for compatibility
  return {
    execute: async ({ sql, args }) => {
      console.log(`Mock DB Query (${dbName}):`, sql, args);
      return { rows: [] };
    }
  };
}

/**
 * Generate a new API key
 * @returns {string} Generated API key
 */
export function generateApiKey() {
  // Generate a random UUID
  const uuid = uuidv4();
  // Format it as an API key with a prefix
  return `sk_${uuid.replace(/-/g, '')}`;
}

/**
 * Authenticate a request using an API key
 * @param {string} apiKey - API key to authenticate
 * @returns {object} API key data if valid
 */
export async function authenticateApiKey(apiKey) {
  if (!apiKey) {
    throw error(401, 'API key is required');
  }

  const db = await getDb('app');
  
  const result = await db.execute({
    sql: 'SELECT * FROM api_keys WHERE key = ? AND active = 1',
    args: [apiKey]
  });

  if (!result.rows || result.rows.length === 0) {
    throw error(401, 'Invalid API key');
  }

  // Update last_used_at
  await db.execute({
    sql: 'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key = ?',
    args: [apiKey]
  });

  return result.rows[0];
}

/**
 * Generate a JWT token for a user
 * @param {object} user - User object with id, role, and other necessary data
 * @param {object} options - Token options
 * @returns {string} JWT token
 */
export function generateJwtToken(user, options = {}) {
  if (!user || !user.id) {
    throw new Error('User data is required to generate a token');
  }
  
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  
  const payload = {
    sub: user.id,
    role: user.role || 'anon',
    name: user.name,
    email: user.email,
    ...options.additionalClaims
  };
  
  const tokenOptions = {
    expiresIn: options.expiresIn || '24h',
    ...options.jwtOptions
  };
  
  return jwt.sign(payload, secret, tokenOptions);
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {object} Decoded token payload
 */
export function verifyJwtToken(token) {
  if (!token) {
    throw error(401, 'Authentication token is required');
  }
  
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw error(401, 'Token has expired');
    }
    throw error(401, 'Invalid token');
  }
}

/**
 * Extract and verify JWT token from request headers
 * @param {object} request - SvelteKit request object
 * @returns {object} Decoded token payload
 */
export function authenticateJwt(request) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    throw error(401, 'Authorization header is required');
  }
  
  const [scheme, token] = authHeader.split(' ');
  
  if (scheme !== 'Bearer' || !token) {
    throw error(401, 'Invalid authorization format. Use: Bearer <token>');
  }
  
  return verifyJwtToken(token);
}

/**
 * Log a search query
 * @param {object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {string} params.apiKeyId - API key ID
 * @param {string} params.siteId - Site ID
 * @param {boolean} params.useVector - Whether vector search was used
 */
export async function logSearchQuery({ query, apiKeyId, siteId, useVector = false }) {
  const db = await getDb('app');
  
  await db.execute({
    sql: `
      INSERT INTO search_logs (
        id, query, api_key_id, site_id, search_type, created_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [
      uuidv4(),
      query,
      apiKeyId,
      siteId,
      useVector ? 'vector' : 'basic'
    ]
  });
}

/**
 * Check if user has superuser role
 * @param {object} user - User object with role information
 * @returns {boolean} True if user has superuser role
 */
export function isSuperUser(user) {
  if (!user) return false;
  const role = user.role || user.publicMetadata?.role;
  return role === 'superuser';
}

/**
 * Check if user has librarian role or higher
 * @param {object} user - User object with role information
 * @returns {boolean} True if user has librarian role or higher
 */
export function isLibrarian(user) {
  if (!user) return false;
  const role = user.role || user.publicMetadata?.role;
  return role === 'librarian' || role === 'superuser';
}

/**
 * Check if user has editor role or higher
 * @param {object} user - User object with role information
 * @returns {boolean} True if user has editor role or higher
 */
export function isEditor(user) {
  if (!user) return false;
  const role = user.role || user.publicMetadata?.role;
  return role === 'editor' || role === 'librarian' || role === 'superuser';
}

/**
 * Check if user has subscriber role or higher
 * @param {object} user - User object with role information
 * @returns {boolean} True if user has subscriber role or higher
 */
export function isSubscriber(user) {
  if (!user) return false;
  const role = user.role || user.publicMetadata?.role;
  return role === 'subscriber' || role === 'editor' || role === 'librarian' || role === 'superuser';
}

/**
 * Authorize a user based on required role
 * @param {object} user - User object with role information
 * @param {string} requiredRole - Required role (subscriber, editor, librarian, superuser)
 * @returns {boolean} True if user has the required role or higher
 */
export function authorizeUser(user, requiredRole) {
  if (!user) return requiredRole === 'anon';
  
  const role = user.role || user.publicMetadata?.role || 'anon';
  const roleHierarchy = {
    'anon': 0,
    'subscriber': 1,
    'editor': 2,
    'librarian': 3,
    'superuser': 4
  };
  
  const userRoleLevel = roleHierarchy[role] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
  
  return userRoleLevel >= requiredRoleLevel;
}
