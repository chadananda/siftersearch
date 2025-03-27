/**
 * Session Validation Endpoint
 * 
 * This endpoint checks if a user is authenticated and returns
 * the user data if so. It's used by the client-side auth system
 * to validate sessions and ensure the UI reflects the correct
 * authentication state.
 */

import { json } from '@sveltejs/kit';

/**
 * GET handler for session validation
 */
export async function GET({ locals }) {
  // If the user is not authenticated, return a 401
  if (!locals.auth?.userId) {
    return json({
      authenticated: false,
      message: 'Not authenticated'
    }, { status: 401 });
  }
  
  try {
    // If the user is authenticated but we don't have their DB record,
    // return a partial success with just the Clerk data
    if (!locals.dbUser) {
      return json({
        authenticated: true,
        message: 'Authenticated with Clerk but no DB user found',
        user: {
          clerkId: locals.auth.userId,
          email: locals.auth.user?.emailAddresses?.[0]?.emailAddress || 
                 locals.auth.user?.primaryEmailAddress?.emailAddress,
          name: locals.auth.user?.firstName && locals.auth.user?.lastName ? 
                `${locals.auth.user.firstName} ${locals.auth.user.lastName}` : 
                `User ${locals.auth.userId.substring(0, 8)}`,
          role: locals.auth.sessionClaims?.role || 'visitor',
          isSuperuser: locals.auth.sessionClaims?.isSuperuser || false
        }
      });
    }
    
    // Return the full user data from the database
    return json({
      authenticated: true,
      message: 'Authenticated',
      user: {
        ...locals.dbUser,
        isSuperuser: locals.auth.sessionClaims?.isSuperuser || false
      }
    });
  } catch (error) {
    console.error('Error validating session:', error);
    
    return json({
      authenticated: false,
      message: 'Error validating session'
    }, { status: 500 });
  }
}
