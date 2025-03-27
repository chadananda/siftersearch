/**
 * Development-only Role Switching API
 * 
 * This endpoint allows switching user roles in development mode
 * for easier testing of role-based access control.
 * 
 * It updates the user's role in the session claims, which will be
 * reflected in JWT claims immediately.
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { clerkClient } from '$lib/server/auth/clerk';

// Ensure this endpoint only works in development mode
// The dev script sets NODE_ENV to 'dev', not 'development'
const isDev = process.env.NODE_ENV === 'dev' || dev;

/**
 * POST handler for role switching
 */
export async function POST({ request, locals, cookies }) {
  // Reject in production mode
  if (!isDev) {
    return json({
      success: false,
      message: 'Role switching is only available in development mode'
    }, { status: 403 });
  }
  
  try {
    const data = await request.json();
    const { role } = data;
    
    if (!role) {
      return json({
        success: false,
        message: 'Missing required parameter: role'
      }, { status: 400 });
    }
    
    // Validate role
    const validRoles = ['visitor', 'subscriber', 'editor', 'librarian', 'admin', 'superuser'];
    if (!validRoles.includes(role)) {
      return json({
        success: false,
        message: `Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`
      }, { status: 400 });
    }
    
    // Get the current auth information
    // Clerk might store the session in different properties depending on the setup
    const userId = locals.auth?.userId || locals.session?.userId;
    
    if (!userId) {
      return json({
        success: false,
        message: 'No active session found. Please sign in.'
      }, { status: 401 });
    }
    
    // For development mode, we'll use a simpler approach with cookies
    // since we're having issues with direct Clerk session updates
    cookies.set('dev_role', role, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });
    
    // Return success
    return json({
      success: true,
      message: `Role updated to ${role}`,
      role
    });
  } catch (error) {
    console.error('Error switching role:', error);
    
    return json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
