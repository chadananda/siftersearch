import { sequence } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import authConfig from '../config/auth';
import { handleClerk } from 'clerk-sveltekit/server';

/**
 * SvelteKit server hooks for authentication and authorization
 * 
 * This file provides authentication and authorization for all routes.
 * In development mode, it works without requiring any external auth packages.
 * In production, it will use Clerk via clerk-sveltekit.
 */

// Check if we're in development mode
const isDevelopment = authConfig.isDevelopment;

// Define public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/', 
  '/about', 
  '/terms', 
  '/contact', 
  '/auth/signout', 
  '/auth/callback',
  '/api/public', 
  '/api/health', 
  '/api-docs',
  '/assets',
  '/documents'
];

// Define API routes that use JWT authentication or API keys
const API_ROUTES = [
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

/**
 * Verify API key against the database
 * @param {string} apiKey - The API key to verify
 * @returns {Promise<Object|null>} - User info if valid, null if invalid
 */
async function verifyApiKey(apiKey) {
  // In development, accept a test API key for convenience
  if (isDevelopment && apiKey === 'test-api-key') {
    console.log('⚠️ Development mode: Using test API key');
    return {
      id: 'api-key-user',
      role: 'api',
      apiKeyId: 'test-key-id'
    };
  }
  
  // TODO: In production, verify the API key against the database
  // This would query your database to check if the API key is valid
  // and return the associated user information and permissions
  
  return null; // Invalid API key
}

// Custom auth handler
const customAuthHandler = async ({ event, resolve }) => {
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
    
    // Check if the route is an API route
    const isApiRoute = API_ROUTES.some(route => 
      pathname === route || pathname.startsWith(`${route}/`)
    );
    
    if (isApiRoute) {
      // Check for API key in X-API-Key header
      const apiKey = event.request.headers.get('X-API-Key');
      
      if (apiKey) {
        // Verify API key
        const apiUser = await verifyApiKey(apiKey);
        
        if (apiUser) {
          // Valid API key, set user info and proceed
          event.locals.user = apiUser;
          return await resolve(event);
        } else {
          // Invalid API key
          return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Invalid API key' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // No API key, check for JWT authentication
      if (isDevelopment) {
        // In development, check if JWT_SECRET is configured
        if (!authConfig.jwt.secret) {
          console.error('❌ JWT_SECRET is not configured in .env file');
          return new Response(JSON.stringify({ 
            error: 'Server Configuration Error', 
            message: 'JWT_SECRET is not configured. Please add it to your .env file.' 
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // In development, allow API access for testing
        console.log('⚠️ Development mode: JWT verification is simplified for testing');
      }
      
      // Verify JWT token
      try {
        const authHeader = event.request.headers.get('Authorization');
        if (!authHeader) {
          throw new Error('Authentication required. Provide either JWT token in Authorization header or API key in X-API-Key header');
        }
        
        // Extract and verify the JWT token
        const token = authHeader.replace('Bearer ', '');
        
        // TODO: In production, verify the JWT token and extract user info
        // const decoded = jwt.verify(token, authConfig.jwt.secret);
        // event.locals.user = {
        //   id: decoded.userId,
        //   email: decoded.email,
        //   role: decoded.role
        // };
        
        // For now, in development, we'll just proceed
        if (isDevelopment) {
          event.locals.user = {
            id: 'jwt-dev-user',
            role: 'superuser'
          };
        }
        
        // Check if user has required role for this API endpoint
        // This would be implemented based on your API's role requirements
        
        return await resolve(event);
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Unauthorized', message: error.message }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // For protected routes, check if we're in development mode
    if (isDevelopment) {
      console.log('⚠️ Development mode: Authentication is simplified for testing');
      
      // In development, allow access with a development user
      event.locals.user = {
        id: 'dev-user-id',
        role: 'superuser'
      };
      
      // Check role-based access
      const requiredRoles = Object.entries(ROLE_BASED_ACCESS).find(([route]) => 
        pathname === route || pathname.startsWith(`${route}/`)
      )?.[1];
      
      if (requiredRoles && !requiredRoles.includes(event.locals.user.role)) {
        // User doesn't have required role
        return new Response(JSON.stringify({ 
          error: 'Forbidden', 
          message: `Access denied. Required role: ${requiredRoles.join(' or ')}` 
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return await resolve(event);
    }
    
    // In production, check for Clerk configuration
    if (!authConfig.clerk.secretKey || !authConfig.clerk.publishableKey) {
      console.error('❌ Clerk API keys are not configured in .env file');
      return new Response(JSON.stringify({ 
        error: 'Server Configuration Error', 
        message: 'Clerk API keys are not configured. Please add CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY to your .env file.' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // At this point, authentication should be handled by Clerk
    // The user should be redirected to sign in if not authenticated
    return redirect(307, '/auth/signin');
  } catch (error) {
    console.error('Authentication error:', error);
    return new Response(JSON.stringify({ error: 'Authentication Error', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Clerk handler with proper configuration
const clerkHandler = handleClerk(process.env.CLERK_SECRET_KEY, {
  debug: isDevelopment,
  protectedPaths: ['/admin', '/dashboard', '/api/protected'],
  signInUrl: '/sign-in',
  publicRoutes: PUBLIC_ROUTES
});

// Conditionally use Clerk in production, custom auth in development
const handleAuth = ({ event, resolve }) => {
  if (isDevelopment) {
    return customAuthHandler({ event, resolve });
  } else {
    return clerkHandler({ event, resolve });
  }
};

// Export the handle function
export const handle = sequence(handleAuth);
