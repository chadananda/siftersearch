/**
 * Server Hooks
 * 
 * This file contains hooks that run on the server side for each request.
 * It's used to initialize server-side resources and middleware.
 */

import { sequence } from '@sveltejs/kit/hooks';
import { handleClerk } from 'clerk-sveltekit/server';
import { PUBLIC, SECRETS } from '../config/config.js';
import db from '$lib/server/db/index.js';
import { getOrCreateUserFromClerk, transformAuth, userHasRole } from '$lib/server/auth/clerk.js';

// Debug flag - set to false to disable verbose logging
const DEBUG_MODE = false;
// Check if we're in development mode
const DEV_MODE = process.env.NODE_ENV === 'development';

// Simplified logging function - no object properties
function log(message) {
  if (!DEBUG_MODE) return;
  console.log(message);
}

/**
 * Initialize database and other server resources
 */
async function initializeServer() {
  try {
    await db.initialize();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

/**
 * Handle function for SvelteKit
 */
async function handleInit({ event, resolve }) {
  // Initialize database if not already done
  await initializeServer();
  
  return resolve(event);
}

/**
 * Handle function for authentication
 */
async function handleAuth({ event, resolve }) {
  const { locals, url, cookies } = event;
  const path = url.pathname;
  
  // Check if route is public (doesn't require authentication)
  const isPublicRoute = ['/login', '/signup', '/auth', '/api/public', '/about', '/contact', '/'].some(
    publicPath => path === publicPath || path.startsWith(publicPath)
  );
  
  // Minimal debug logging
  if (DEBUG_MODE) {
    log(`[Auth] Path: ${path}, Public: ${isPublicRoute}`);
  }
  
  // Check for superuser session first
  const superuserToken = cookies.get('__superuser');
  if (superuserToken) {
    try {
      // Verify the superuser session in the database
      const session = await db.query(
        'SELECT * FROM sessions WHERE token = ? AND expires_at > ?',
        [superuserToken, new Date().toISOString()]
      ).then(rows => rows[0]);
      
      if (session) {
        // Get the superuser from the database
        const superuser = await db.query(
          'SELECT * FROM users WHERE id = ? AND role = ?',
          [session.user_id, 'superuser']
        ).then(rows => rows[0]);
        
        if (superuser) {
          if (DEBUG_MODE) {
            log(`[Auth] Superuser authenticated: ${superuser.email}`);
          }
          
          // Add superuser to locals for access in routes
          locals.dbUser = {
            ...superuser,
            isSuperuser: true
          };
          
          // Continue to the route handler
          return resolve(event);
        }
      }
      
      // If session verification failed, clear the superuser cookie
      cookies.delete('__superuser', { path: '/' });
    } catch (error) {
      console.error('Error verifying superuser session:', error);
      // Clear the superuser cookie on error
      cookies.delete('__superuser', { path: '/' });
    }
  }
  
  // Check if user is authenticated through Clerk
  if (locals.session?.userId || locals.auth?.userId) {
    try {
      const clerkUserId = locals.session?.userId || locals.auth?.userId;
      
      if (DEBUG_MODE) {
        log(`[Auth] User authenticated with Clerk ID: ${clerkUserId}`);
      }
      
      // Use the session data or auth data for user retrieval
      const authData = locals.session || locals.auth;
      
      // Get or create user in our database
      const user = await getOrCreateUserFromClerk(authData);
      
      if (!user) {
        if (DEBUG_MODE) {
          log('[Auth] Failed to get or create user from Clerk auth data');
        }
        
        // Fall back to Clerk data if database retrieval fails
        locals.dbUser = {
          id: clerkUserId,
          clerk_id: clerkUserId,
          role: authData.sessionClaims?.role || 'visitor',
          name: authData.sessionClaims?.name || 'Unknown',
          email: authData.sessionClaims?.email || '',
          active: true
        };
      } else {
        // Add user to locals for access in routes
        locals.dbUser = user;
      }
      
      // Check if route is protected (requires authentication)
      const protectedRoutes = {
        '/documents': 'subscriber',
        '/edit': 'editor',
        '/analytics': 'librarian',
        '/sites': 'superuser',
        '/users': 'superuser',
        '/config': 'superuser',
        '/activity': 'subscriber'
      };
      
      // Check if the current path matches any protected route
      const requiredRole = Object.entries(protectedRoutes).find(([route, _]) => 
        path === route || path.startsWith(`${route}/`)
      )?.[1];
      
      if (requiredRole && (!locals.dbUser || !userHasRole(locals.dbUser, requiredRole))) {
        if (DEBUG_MODE) {
          log(`[Auth] Access denied to ${path}, required role: ${requiredRole}, user role: ${locals.dbUser?.role || 'none'}`);
        }
        
        // Redirect to home page if user doesn't have the required role
        return Response.redirect('/', 303);
      }
    } catch (error) {
      console.error('Error handling auth:', error);
      
      // Clear any invalid session cookies
      if (error.message?.includes('token-expired') || error.message?.includes('invalid')) {
        if (DEBUG_MODE) {
          log('[Auth] Clearing invalid session cookies due to:', error.message);
        }
        
        // Clear Clerk cookies
        const clerkCookies = cookies.getAll()
          .filter(cookie => cookie.name.startsWith('__clerk') || cookie.name.startsWith('__session'));
        
        for (const cookie of clerkCookies) {
          cookies.delete(cookie.name, { path: '/' });
        }
        
        // Set anonymous user
        locals.dbUser = {
          id: null,
          role: 'anonymous',
          name: 'Guest',
          email: '',
          active: true
        };
      }
    }
  } else {
    // User is not authenticated
    if (DEBUG_MODE) {
      log(`[Auth] No authenticated user for path: ${path}`);
    }
    
    // In development mode, allow access to all routes
    if (DEV_MODE) {
      locals.dbUser = {
        id: null,
        role: 'visitor', // Give visitor role in dev mode
        name: 'Dev Guest',
        email: '',
        active: true
      };
      
      if (DEBUG_MODE) {
        log(`[Auth] Development mode: allowing access to ${path} for unauthenticated user`);
      }
    } else {
      // For API routes that aren't public, return 401
      if (path.startsWith('/api/') && !path.startsWith('/api/public')) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      // For protected routes, redirect to login if not public
      if (!isPublicRoute) {
        const protectedPaths = ['/documents', '/edit', '/analytics', '/sites', '/users', '/config', '/activity'];
        if (protectedPaths.some(protectedPath => path.startsWith(protectedPath))) {
          // Redirect to login
          return Response.redirect(`/login?redirect=${encodeURIComponent(path)}`, 303);
        }
      }
    }
  }
  
  return resolve(event);
}

/**
 * Handle function for request logging
 */
async function handleLogging({ event, resolve }) {
  const { request, url } = event;
  const method = request.method;
  const path = url.pathname;
  
  // Log request (minimal information)
  console.log(`${method} ${path}`);
  
  // Resolve the request
  const response = await resolve(event);
  
  // Log response status
  console.log(`${method} ${path} - ${response.status}`);
  
  return response;
}

// Clerk middleware with custom transformAuth function
const clerkMiddleware = handleClerk(
  SECRETS.CLERK_SECRET_KEY,
  {
    // Pass the event to transformAuth so it can access cookies
    transformAuth: (auth, req) => {
      // Extract cookies from the request event
      const cookies = req.event.cookies;
      console.log('[DEBUG] HOOKS: Clerk middleware transformAuth called');
      console.log('[DEBUG] HOOKS: auth userId:', auth?.userId);
      console.log('[DEBUG] HOOKS: cookies object type:', typeof cookies);
      
      // Log all cookies for debugging
      if (typeof cookies?.getAll === 'function') {
        console.log('[DEBUG] HOOKS: All cookies:', cookies.getAll());
      } else {
        console.log('[DEBUG] HOOKS: cookies.getAll is not a function');
      }
      
      // Call our transformAuth function with auth and cookies
      return transformAuth(auth, cookies);
    }
  }
);

// Export the handle function as a sequence of middleware
export const handle = sequence(handleInit, clerkMiddleware, handleAuth, handleLogging);
