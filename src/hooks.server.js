import { sequence } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { withClerkHandler } from 'svelte-clerk/server';
import { verifyJwtToken } from '$lib/api/utils';

/**
 * SvelteKit server hooks for authentication and authorization
 * Integrates with Clerk for authentication and JWT for API access
 */

// Define public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/', 
  '/about', 
  '/terms', 
  '/contact', 
  // '/auth/signin',  
  '/auth/signout', 
  '/auth/callback',
  '/api/public', 
  '/api/health', 
  '/api-docs',
  '/assets',
  '/documents' // Add documents to public routes temporarily for testing
];

// Define API routes that use JWT authentication
const JWT_API_ROUTES = [
  '/api/documents',
  '/api/users',
  '/api/sites',
  '/api/analytics',
  '/api/keys'
];

// Define role-based page access
const ROLE_BASED_ACCESS = {
  '/documents': ['superuser', 'librarian', 'editor', 'subscriber'],
  '/edit': ['superuser', 'librarian', 'editor'],
  '/analytics': ['superuser', 'librarian'],
  '/sites': ['superuser'],
  '/users': ['superuser'],
  '/config': ['superuser'],
  '/activity': ['superuser', 'librarian', 'editor', 'subscriber']
};

// Auth handler
const handleAuth = async ({ event, resolve }) => {
  try {
    // Initialize user/auth state with anonymous role by default
    event.locals.user = null;
    event.locals.auth = { userId: null, sessionId: null };
    
    const { pathname } = event.url;
    
    // Check if the route is public
    const isPublicRoute = PUBLIC_ROUTES.some(route => 
      pathname === route || pathname.startsWith(`${route}/`)
    );
    
    if (isPublicRoute) {
      return await resolve(event);
    }
    
    // Check if the route is a JWT API route
    const isJwtApiRoute = JWT_API_ROUTES.some(route => 
      pathname === route || pathname.startsWith(`${route}/`)
    );
    
    if (isJwtApiRoute) {
      try {
        // Verify JWT token from Authorization header
        const authHeader = event.request.headers.get('Authorization');
        if (!authHeader) {
          throw new Error('Authorization header missing');
        }
        
        const token = authHeader.replace('Bearer ', '');
        const decoded = verifyJwtToken(token);
        
        // Set user info from JWT token
        event.locals.user = {
          id: decoded.userId,
          role: decoded.role,
          email: decoded.email
        };
        
        return await resolve(event);
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Unauthorized', message: error.message }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // For protected routes, check if user is authenticated
    if (!event.locals.auth?.userId) {
      // User is not authenticated, but we're using Google One Tap
      // Instead of redirecting, just continue and let the client-side handle auth
      // throw redirect(303, `/auth/signin?redirect_url=${encodeURIComponent(pathname)}`);
      return await resolve(event);
    }
    
    // Get user data from session
    const userId = event.locals.auth.userId;
    
    if (!userId) {
      throw redirect(303, '/auth/signin');
    }
    
    // Set user info in locals
    event.locals.user = {
      id: userId,
      role: 'subscriber' // Default role, should be fetched from your database
    };
    
    // Check role-based access
    for (const [path, allowedRoles] of Object.entries(ROLE_BASED_ACCESS)) {
      if (pathname === path || pathname.startsWith(`${path}/`)) {
        if (!allowedRoles.includes(event.locals.user.role)) {
          // User doesn't have the required role
          return new Response(JSON.stringify({ error: 'Forbidden', message: 'Insufficient permissions' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;
      }
    }
    
    return await resolve(event);
  } catch (error) {
    if (error.status === 303) {
      throw error; // Let redirect pass through
    }
    
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Export the handle function as a sequence of middleware
export const handle = sequence(withClerkHandler(), handleAuth);
