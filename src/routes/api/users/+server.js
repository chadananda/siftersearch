/**
 * User Management API
 * 
 * This API provides endpoints for managing users.
 * All endpoints require admin or superuser permissions.
 */

import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import drizzleDb from '$lib/server/db/drizzle-crud.js';
import { userHasRole } from '$lib/server/auth/clerk.js';

/**
 * Check if the user has admin permissions
 * @param {Object} user - User object
 * @returns {boolean} Whether the user has admin permissions
 */
function hasAdminPermission(user) {
  return user && userHasRole(user, ['admin', 'superuser']);
}

/**
 * GET /api/users
 * Get users with filtering
 */
export async function GET({ request, url, locals }) {
  try {
    // Get user from locals
    const user = locals.dbUser;
    
    console.log('API /users - Current user:', user?.email, 'role:', user?.role);
    
    // Check if user is authenticated and has admin permissions
    if (!user || !hasAdminPermission(user)) {
      console.error('API /users - Unauthorized access attempt:', user?.email, user?.role);
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get query parameters for filtering
    const search = url.searchParams.get('search') || '';
    const role = url.searchParams.get('role') || '';
    
    console.log('API /users - Fetching users with params:', { search, role });
    
    // Get users with filtering
    const result = await drizzleDb.getUsers({
      search,
      role
    });
    
    console.log(`API /users - Found ${result.users.length} of ${result.totalCount} total users`);
    
    return json({
      users: result.users,
      totalCount: result.totalCount
    });
  } catch (error) {
    console.error('Error getting users:', error);
    return json({ error: 'Failed to get users' }, { status: 500 });
  }
}

/**
 * POST /api/users
 * Create a new user
 */
export async function POST({ request, locals }) {
  console.log('POST /api/users - Create user request received');
  
  // Check if user exists in locals
  if (!locals.dbUser) {
    console.log('No authenticated user found in request locals');
    return json({ error: 'Authentication required' }, { status: 401 });
  }
  
  console.log('User making request:', locals.dbUser?.email, 'Role:', locals.dbUser?.role);
  
  // Check permissions
  if (!hasAdminPermission(locals.dbUser)) {
    console.log('Permission denied: User does not have admin permissions');
    return json({ error: 'Unauthorized - Admin permissions required' }, { status: 403 });
  }
  
  try {
    // Parse the request body
    let userData;
    try {
      userData = await request.json();
      console.log('Received user data:', userData);
    } catch (error) {
      console.error('Error parsing request JSON:', error);
      return json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    
    // Validate required fields
    if (!userData.email || !userData.name || !userData.role) {
      console.log('Validation failed: Missing required fields');
      const missingFields = [];
      if (!userData.email) missingFields.push('email');
      if (!userData.name) missingFields.push('name');
      if (!userData.role) missingFields.push('role');
      
      return json({ 
        error: 'Missing required fields', 
        details: `The following fields are required: ${missingFields.join(', ')}` 
      }, { status: 400 });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      console.log('Validation failed: Invalid email format');
      return json({ error: 'Invalid email format' }, { status: 400 });
    }
    
    // Check if user with this email already exists
    try {
      const existingUser = await drizzleDb.getUserByEmail(userData.email);
      if (existingUser) {
        console.log('User with this email already exists:', existingUser.id);
        return json({ error: 'A user with this email already exists' }, { status: 409 });
      }
    } catch (error) {
      console.log('Error checking for existing user:', error);
      // Continue with creation attempt
    }
    
    // Generate a timestamp for created_at and updated_at
    const now = new Date().toISOString();
    
    // Create user
    console.log('Creating user in database...');
    try {
      const user = await drizzleDb.createUser({
        email: userData.email,
        name: userData.name,
        role: userData.role,
        clerk_id: userData.clerk_id || `manual-${Date.now()}`, // Generate a placeholder clerk_id if not provided
        active: userData.active !== undefined ? userData.active : true,
        created_at: now,
        updated_at: now
      });
      
      console.log('User created successfully:', user);
      return json({ user, success: true });
    } catch (dbError) {
      console.error('Database error creating user:', dbError);
      return json({ error: 'Database error creating user', details: dbError.message }, { status: 500 });
    }
  } catch (error) {
    console.error('Error creating user:', error);
    return json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
