/**
 * User Logout API Endpoint
 * 
 * Handles user logout requests
 */

import { json } from '@sveltejs/kit';

/**
 * POST handler for /api/auth/logout
 * Logs out the current user
 */
export async function POST({ locals, request, cookies }) {
  console.log('[API] /api/auth/logout - Request received');
  
  try {
    // Check if user is authenticated
    const isAuthenticated = locals.dbUser && locals.dbUser.role !== 'anonymous';
    
    if (isAuthenticated) {
      console.log('[API] /api/auth/logout - Logging out authenticated user:', 
        locals.dbUser.email || 'No email', `(${locals.dbUser.role})`);
    } else {
      console.log('[API] /api/auth/logout - No authenticated user to log out');
    }
    
    // Clear any session cookies (Clerk will handle this on its end, but we do it here as well for redundancy)
    const cookieNames = Object.keys(cookies.getAll());
    for (const name of cookieNames) {
      if (name.startsWith('__session') || name.startsWith('__clerk') || name.includes('auth')) {
        console.log('[API] /api/auth/logout - Clearing cookie:', name);
        cookies.delete(name, { path: '/' });
      }
    }
    
    // Return success response
    return json({
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] /api/auth/logout - Error logging out:', error);
    
    // Return error response
    return json({
      success: false,
      error: 'Failed to log out',
      message: error.message || 'An unknown error occurred',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
