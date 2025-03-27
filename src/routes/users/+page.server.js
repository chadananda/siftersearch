/**
 * User Management Page - Server Logic
 * 
 * This file handles data loading and permission checks for the user management page.
 * Only admins and superusers can access this page.
 */

import { redirect } from '@sveltejs/kit';
import { userHasRole } from '$lib/server/auth/clerk.js';
import drizzleDb from '$lib/server/db/drizzle-crud.js';

/**
 * Check if the user has admin permissions
 * @param {Object} user - User object
 * @returns {boolean} Whether the user has admin permissions
 */
function hasAdminPermission(user) {
  return user && userHasRole(user, ['admin', 'superuser']);
}

/**
 * Load data for the user management page
 */
export async function load({ locals, url }) {
  const user = locals.dbUser;
  
  console.log('Loading users page, current user:', user?.email, 'role:', user?.role);
  
  // Check if user is authenticated and has admin permissions
  if (!user || !hasAdminPermission(user)) {
    throw redirect(302, '/');
  }
  
  // Get query parameters for filtering
  const search = url.searchParams.get('search') || '';
  const role = url.searchParams.get('role') || '';
  
  try {
    console.log('Fetching users with params:', { search, role });
    
    // Get users with filtering
    const result = await drizzleDb.getUsers({
      search,
      role
    });
    
    console.log(`Retrieved ${result.users.length} of ${result.totalCount} total users from database`);
    
    // Get available roles for the filter dropdown
    const roles = ['visitor', 'user', 'subscriber', 'editor', 'librarian', 'admin', 'superuser'];
    
    return {
      users: result.users,
      totalCount: result.totalCount,
      roles,
      currentUser: user
    };
  } catch (error) {
    console.error('Error loading users:', error);
    return {
      users: [],
      totalCount: 0,
      roles: ['visitor', 'user', 'subscriber', 'editor', 'librarian', 'admin', 'superuser'],
      currentUser: user,
      error: 'Failed to load users'
    };
  }
}
