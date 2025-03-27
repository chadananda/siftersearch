/**
 * Clerk Authentication Module
 * 
 * This module handles integration with Clerk authentication service
 * and role management for one-tap login.
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import drizzleDb from '../db/drizzle-crud.js';
import { SECRETS } from '../../../../config/config.js';

// Debug flag - set to false to disable verbose logging
const DEBUG_MODE = false;
// Check if we're in development mode
const DEV_MODE = process.env.NODE_ENV === 'development';

// Simplified logging function
function log(message) {
  if (!DEBUG_MODE) return;
  console.log(message);
}

// Lazy-loaded Clerk client to avoid initialization errors
let clerkClient = null;

/**
 * Get the Clerk client instance
 * @returns {Object} Clerk client
 */
function getClerkClient() {
  if (!clerkClient) {
    try {
      // Dynamically import Clerk SDK to avoid SSR issues
      const { createClerkClient } = require('@clerk/clerk-sdk-node');
      
      if (!SECRETS.CLERK_SECRET_KEY) {
        console.error('Clerk secret key is not defined');
        return null;
      }
      
      clerkClient = createClerkClient({ 
        secretKey: SECRETS.CLERK_SECRET_KEY 
      });
      
      if (DEBUG_MODE) {
        log('Clerk client initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize Clerk client:', error);
      return null;
    }
  }
  
  return clerkClient;
}

/**
 * Get user details from Clerk API
 * @param {string} clerkId - Clerk user ID
 * @returns {Promise<Object|null>} Clerk user data or null if not found
 */
export async function getClerkUser(clerkId) {
  if (!clerkId) {
    console.error('getClerkUser: Missing clerkId parameter');
    return null;
  }
  
  try {
    const client = getClerkClient();
    
    if (!client) {
      console.error('Clerk client not available');
      return null;
    }
    
    if (DEBUG_MODE) {
      log(`Fetching user from Clerk API: ${clerkId}`);
    }
    
    const user = await client.users.getUser(clerkId);
    
    if (!user) {
      if (DEBUG_MODE) {
        log(`User not found in Clerk API: ${clerkId}`);
      }
      return null;
    }
    
    if (DEBUG_MODE) {
      log(`User retrieved from Clerk API: ${user.id}`);
    }
    return user;
  } catch (error) {
    console.error('Error fetching user from Clerk API:', error);
    return null;
  }
}

/**
 * Get or create a user from Clerk authentication data
 * @param {Object} authData - Authentication data from Clerk
 * @returns {Promise<Object>} User data
 */
export async function getOrCreateUserFromClerk(authData) {
  if (DEBUG_MODE) {
    log('=== getOrCreateUserFromClerk ===');
    // Only log essential information, not the entire auth object
    log(`Auth data userId: ${authData?.userId}`);
  }
  
  if (!authData || !authData.userId) {
    console.error('Invalid auth data: Missing userId');
    return null;
  }
  
  const clerkUserId = authData.userId;
  
  // Get user email from auth data
  let userEmail = authData.user?.emailAddresses?.[0]?.emailAddress || 
                 authData.user?.primaryEmailAddress?.emailAddress;
  
  // If in development mode and no real email is available, use a consistent one
  if (DEV_MODE && (!userEmail || userEmail.includes('@example.com'))) {
    // Use a consistent email based on the Clerk ID
    userEmail = `dev-${clerkUserId.substring(0, 8)}@siftersearch.dev`;
  } else if (!userEmail) {
    // Fallback for production if somehow no email is available
    userEmail = `user-${clerkUserId.substring(0, 8)}@example.com`;
  }
  
  // Check if this is the superuser email
  const isSuperuser = userEmail === SECRETS.ROOT_SUPERUSER_EMAIL;
  
  if (isSuperuser) {
    if (DEBUG_MODE) {
      log(`Superuser email detected: ${userEmail}`);
    }
    
    // Check if user exists in database
    let user = await drizzleDb.getUserByClerkId(clerkUserId);
    
    // If user doesn't exist, create it as superuser
    if (!user) {
      if (DEBUG_MODE) {
        log('Superuser not found in database, creating...');
      }
      
      try {
        // Create superuser with the correct role
        user = await drizzleDb.createUser({
          clerk_id: clerkUserId,
          email: SECRETS.ROOT_SUPERUSER_EMAIL,
          name: authData.user?.firstName && authData.user?.lastName ? 
                `${authData.user.firstName} ${authData.user.lastName}` : 
                `System Superuser`,
          role: 'superuser',
          active: 1
        });
        
        if (DEBUG_MODE) {
          log('Created superuser account successfully');
        }
      } catch (error) {
        console.error('Error creating superuser account:', error);
        // Continue with normal user creation
      }
    } else if (user.role !== 'superuser') {
      // Update the role to superuser if it's not already
      try {
        user = await drizzleDb.updateUser(user.id, {
          role: 'superuser'
        });
        
        if (DEBUG_MODE) {
          log('Updated user to superuser role');
        }
      } catch (error) {
        console.error('Error updating user to superuser role:', error);
      }
    }
    
    // Return the superuser with profile image
    return {
      ...user,
      profileImageUrl: authData.user?.profileImageUrl || null
    };
  }
  
  if (DEBUG_MODE) {
    log(`Getting or creating user for Clerk ID: ${clerkUserId}`);
  }
  
  try {
    // Get user from database by Clerk ID
    const user = await drizzleDb.getUserByClerkId(clerkUserId);
    
    if (user) {
      if (DEBUG_MODE) {
        log(`User found in database: ${user.email}, role: ${user.role}`);
      }
      
      // We only need to update from Clerk API if we have extra data to sync
      // For now, skip this step to avoid potential Clerk API issues
      return user;
    } else {
      if (DEBUG_MODE) {
        log('User not found in database');
      }
      
      // In development mode, we can assign a higher role for testing
      const defaultRole = DEV_MODE ? 'admin' : 'visitor';
      
      // Create a basic user using just the auth data
      // This avoids the need to call Clerk API
      const userData = {
        id: uuidv4(),
        clerk_id: clerkUserId,
        // Use the consistent email we determined above
        email: userEmail,
        // Get name from auth data if available
        name: authData.user?.firstName && authData.user?.lastName ? 
              `${authData.user.firstName} ${authData.user.lastName}` : 
              `User ${clerkUserId.substring(0, 8)}`,
        role: defaultRole, // Default role for new users
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      if (DEBUG_MODE) {
        log(`New user data: ${userData.email}, role: ${userData.role}`);
      }
      
      try {
        const newUser = await drizzleDb.createUser(userData);
        if (DEBUG_MODE) {
          log(`New user created: ${newUser.email}, role: ${newUser.role}`);
        }
        return newUser;
      } catch (createError) {
        console.error('Error creating user:', createError);
        
        // If creation failed, try fetching again (might have been created by another request)
        const retryUser = await drizzleDb.getUserByClerkId(clerkUserId);
        if (retryUser) {
          if (DEBUG_MODE) {
            log('User was created by another process, using that record');
          }
          return retryUser;
        }
        
        throw createError;
      }
    }
  } catch (error) {
    console.error('Error in getOrCreateUserFromClerk:', error);
    throw error;
  }
}

/**
 * Update a user's role
 * @param {string} userId - User ID
 * @param {string} role - New role ('admin', 'librarian', 'editor', 'subscriber', 'visitor')
 * @returns {Promise<Object>} Updated user
 */
export async function updateUserRole(userId, role) {
  const validRoles = ['admin', 'librarian', 'editor', 'subscriber', 'visitor'];
  
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
  }
  
  try {
    const user = await drizzleDb.getUserById(userId);
    
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    
    const updatedUser = await drizzleDb.updateUser(userId, { 
      role
    });
    
    if (DEBUG_MODE) {
      log(`User role updated: ${userId}, new role: ${role}`);
    }
    
    return updatedUser;
  } catch (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
}

/**
 * Check if a user has a required role
 * @param {Object} user - User object
 * @param {string|Array} requiredRole - Required role or array of roles
 * @returns {boolean} Whether the user has the required role
 */
export function userHasRole(user, requiredRole) {
  // If no user or inactive user, they have no roles
  if (!user || !user.active) {
    return false;
  }
  
  // In development mode, always return true to allow access
  if (DEV_MODE) {
    return true;
  }
  
  // If the user is a superuser, they have access to everything
  if (user.role === 'superuser' || user.isSuperuser) {
    return true;
  }
  
  // Define role hierarchy (higher index = higher privileges)
  const roleHierarchy = ['visitor', 'subscriber', 'editor', 'librarian', 'admin', 'superuser'];
  
  // Get the user's role index
  const userRoleIndex = roleHierarchy.indexOf(user.role);
  
  // If user has an invalid role, deny access
  if (userRoleIndex === -1) {
    return false;
  }
  
  // If requiredRole is an array, check if user has any of the required roles
  if (Array.isArray(requiredRole)) {
    // Find the lowest required role index (least privileged role that would grant access)
    let lowestRequiredRoleIndex = Infinity;
    
    for (const role of requiredRole) {
      const roleIndex = roleHierarchy.indexOf(role);
      if (roleIndex !== -1 && roleIndex < lowestRequiredRoleIndex) {
        lowestRequiredRoleIndex = roleIndex;
      }
    }
    
    // If no valid required roles were found, deny access
    if (lowestRequiredRoleIndex === Infinity) {
      return false;
    }
    
    // User has access if their role index is >= the lowest required role index
    return userRoleIndex >= lowestRequiredRoleIndex;
  }
  
  // Get the required role index
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
  
  // User has the role if their role index is >= the required role index
  return userRoleIndex >= requiredRoleIndex && requiredRoleIndex !== -1;
}

/**
 * Transform Clerk auth data into JWT claims
 * 
 * This function is called by the Clerk middleware to transform
 * the authentication data into JWT claims. It adds custom claims
 * like role and superuser status.
 * 
 * @param {Object} auth - Clerk auth data
 * @param {Object} cookies - Request cookies
 * @returns {Object} Transformed auth data with custom claims
 */
export function transformAuth(auth, cookies) {
  // Import isDev from environment
  const isDev = process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development';
  
  // If not authenticated, return as is
  if (!auth.userId) {
    return auth;
  }
  
  // Get user email from Clerk data
  const userEmail = auth.user?.emailAddresses?.[0]?.emailAddress || 
                    auth.user?.primaryEmailAddress?.emailAddress;
  
  // Check if this is the root superuser
  const isSuperuser = userEmail === SECRETS.ROOT_SUPERUSER_EMAIL;
  
  // In development mode, check for role in session claims
  // This is set by the /api/dev/role endpoint
  if (isDev) {
    // Check if we already have role in session claims from Clerk API update
    const sessionRole = auth.sessionClaims?.publicMetadata?.role;
    
    if (sessionRole) {
      // Return the auth object with the role from session claims
      auth.sessionClaims = {
        ...(auth.sessionClaims || {}),
        role: sessionRole,
        isSuperuser: sessionRole === 'superuser'
      };
      
      return auth;
    }
  }
  
  // Otherwise, use the database role or default to visitor
  // This would normally involve a database lookup, but we're simplifying
  // for the purpose of this implementation
  auth.sessionClaims = {
    ...(auth.sessionClaims || {}),
    role: isSuperuser ? 'superuser' : 'visitor',
    isSuperuser
  };
  
  return auth;
}
