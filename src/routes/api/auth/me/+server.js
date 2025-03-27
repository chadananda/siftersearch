/**
 * User Authentication API Endpoint
 * 
 * Returns the current authenticated user's data
 */

import { json } from '@sveltejs/kit';

// Debug flag to control logging
const DEBUG_MODE = false;

/**
 * Simple logging function that only logs when debug mode is enabled
 */
function debugLog(message, data = null) {
  if (DEBUG_MODE || import.meta.env.DEV) {
    if (data) {
      // Only log essential data, not full objects
      if (typeof data === 'object') {
        // Create a simplified version of the data
        const simplifiedData = {};
        if (data.userId) simplifiedData.userId = data.userId;
        if (data.role) simplifiedData.role = data.role;
        if (data.email) simplifiedData.email = data.email;
        console.log(`[Auth Debug] ${message}:`, simplifiedData);
      } else {
        console.log(`[Auth Debug] ${message}:`, data);
      }
    } else {
      console.log(`[Auth Debug] ${message}`);
    }
  }
}

/**
 * GET handler for /api/auth/me
 * Returns the current authenticated user's data
 */
export async function GET({ locals, request, cookies }) {
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'dev';
  
  // Get validation request flag from headers
  const isValidationRequest = request.headers.get('x-validation-request') === 'true';
  const requestTime = request.headers.get('x-request-time');
  
  // Minimal logging
  debugLog(`/api/auth/me - ${isValidationRequest ? 'Validation request' : 'Standard request'}${requestTime ? ` at ${new Date(parseInt(requestTime)).toISOString()}` : ''}`);
  
  // In development mode, check for role override cookie
  if (isDev && locals.dbUser) {
    const devRole = cookies.get('dev_role');
    if (devRole) {
      console.log(`[DEV] Overriding user role from ${locals.dbUser.role} to ${devRole} from cookie`);
      locals.dbUser.role = devRole;
      locals.dbUser.isSuperuser = devRole === 'superuser';
    }
  }
  
  // Log user info without full objects
  if (locals.dbUser) {
    debugLog('User', { 
      email: locals.dbUser.email || 'No email', 
      role: locals.dbUser.role,
      id: locals.dbUser.id
    });
  } else {
    debugLog('User: Not authenticated');
  }
  
  // Check if user is authenticated
  const isAuthenticated = locals.dbUser && locals.dbUser.id && locals.dbUser.role !== 'anonymous';
  
  // Prepare response
  const responseData = {
    authenticated: isAuthenticated,
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substring(2, 15),
    validationRequest: isValidationRequest
  };
  
  if (isAuthenticated) {
    // Return user data with minimal debug info
    responseData.user = locals.dbUser;
    responseData.sessionInfo = {
      present: !!locals.session,
      userId: locals.session?.userId || null,
      clerkId: locals.dbUser?.clerk_id || null,
      status: 'active', // If we got here with dbUser, the session is active
      matchesUser: locals.session?.userId === locals.dbUser?.clerk_id
    };
  } else {
    // Return error with minimal debug info
    responseData.error = 'User not authenticated';
    responseData.sessionPresent = !!locals.session;
    responseData.authPresent = !!locals.auth;
    
    // Include minimal session info for debugging
    if (locals.session) {
      responseData.sessionInfo = {
        userId: locals.session.userId || null,
        status: 'inactive'
      };
    } else {
      responseData.sessionInfo = null;
    }
    
    // Include anonymous user info if available
    if (locals.dbUser && locals.dbUser.role === 'anonymous') {
      responseData.anonymousUser = {
        role: locals.dbUser.role,
        active: locals.dbUser.active
      };
    }
  }
  
  // Return response with cache control headers to prevent caching
  return new Response(JSON.stringify(responseData), {
    status: isAuthenticated ? 200 : 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}
