/**
 * User Management API - Individual User Operations
 * 
 * This API provides endpoints for managing individual users by ID.
 * All endpoints require admin or superuser permissions.
 */

import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import drizzleDb from '$lib/server/db/drizzle-crud.js';
import { userHasRole } from '$lib/server/auth/clerk.js';

/**
 * Check if the user has admin permissions
 * @param {Object} locals - Request locals
 * @returns {boolean} Whether the user has admin permissions
 */
function hasAdminPermission(locals) {
  const user = locals.dbUser;
  return user && userHasRole(user, ['admin', 'superuser']);
}

/**
 * GET /api/users/[id]
 * Get a user by ID
 */
export async function GET({ params, locals }) {
  // Check permissions
  if (!hasAdminPermission(locals)) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  try {
    const userId = params.id;
    
    // Get user
    const user = await drizzleDb.getUserById(userId);
    
    if (!user) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    return json({ user });
  } catch (error) {
    console.error('Error getting user:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/users/[id]
 * Update a user
 */
export async function PUT({ params, request, locals }) {
  // Check permissions
  if (!hasAdminPermission(locals)) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  try {
    const userId = params.id;
    const updates = await request.json();
    
    // Check if user exists
    const existingUser = await drizzleDb.getUserById(userId);
    
    if (!existingUser) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    // Special protection for superuser role
    // Only superusers can modify other superusers
    if (existingUser.role === 'superuser' && locals.dbUser.role !== 'superuser') {
      return json({ error: 'Only superusers can modify other superusers' }, { status: 403 });
    }
    
    // Prevent role escalation
    // Users cannot assign roles higher than their own
    if (updates.role && !userHasRole(locals.dbUser, updates.role)) {
      return json({ error: 'Cannot assign a role higher than your own' }, { status: 403 });
    }
    
    // Update user
    const updatedUser = await drizzleDb.updateUser(userId, updates);
    
    return json({ user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]
 * Delete a user
 */
export async function DELETE({ params, locals }) {
  // Check permissions
  if (!hasAdminPermission(locals)) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  try {
    const userId = params.id;
    
    // Check if user exists
    const existingUser = await drizzleDb.getUserById(userId);
    
    if (!existingUser) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    // Special protection for superuser role
    // Only superusers can delete other superusers
    if (existingUser.role === 'superuser' && locals.dbUser.role !== 'superuser') {
      return json({ error: 'Only superusers can delete other superusers' }, { status: 403 });
    }
    
    // Prevent self-deletion
    if (existingUser.id === locals.dbUser.id) {
      return json({ error: 'Cannot delete your own account' }, { status: 403 });
    }
    
    // Delete user
    await drizzleDb.deleteUser(userId);
    
    return json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
