/**
 * Client-side Authentication Utilities
 * 
 * Provides functions for working with authentication and roles in the frontend.
 */
import { browser } from '$app/environment';
import { writable, derived, get } from 'svelte/store';
import { page } from '$app/stores';

// Debug mode flag - set to false to disable most logging
const debugMode = false;

// Development mode detection
const isDev = browser && import.meta.env.DEV;

// Validation state tracking
let validationInProgress = false;
let lastValidationTime = 0;
let sessionRetryCount = 0;
const MAX_SESSION_RETRIES = 3;
const SESSION_RETRY_DELAY = 2000; // 2 seconds between retries

// Create a persistent auth store
export const authStore = writable({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  hasChecked: false
});

/**
 * Helper function to get the current auth state
 * This can be used in any component to access the current auth state
 * @returns {Object} The current auth state
 */
export function getAuthState() {
  return get(authStore);
}

/**
 * Initialize the auth store with data from the page
 * @param {Object} pageData - Data from the page
 */
export function initializeAuthStore(pageData) {
  if (!browser) return;
  
  if (debugMode) console.log('Initializing auth store');
  
  // Get user data from page
  const userData = pageData?.user;
  
  // Check if we have a development mode role override
  let userWithDevRole = userData;
  
  if (browser && import.meta.env.DEV && userData) {
    const devRole = localStorage.getItem('dev_user_role');
    if (devRole) {
      console.log(`[DEV] Using role from localStorage: ${devRole}`);
      userWithDevRole = {
        ...userData,
        role: devRole,
        isSuperuser: devRole === 'superuser'
      };
    }
  }
  
  // Set initial auth state
  authStore.set({
    isAuthenticated: !!userWithDevRole,
    user: userWithDevRole || null,
    isLoading: false,
    hasChecked: true
  });
  
  // Update the store with data from the page store
  const unsubscribe = page.subscribe(($page) => {
    // Always prioritize server-provided user data, but apply dev role override if needed
    const user = $page.data?.user;
    
    if (user) {
      if (debugMode) console.log('Auth store update from page data:', 
        `User: ${user.email || 'No email'} (${user.role})`);
      
      // Apply dev role override if available
      let userToUse = user;
      if (browser && import.meta.env.DEV) {
        const devRole = localStorage.getItem('dev_user_role');
        if (devRole) {
          userToUse = {
            ...user,
            role: devRole,
            isSuperuser: devRole === 'superuser'
          };
        }
      }
      
      // Consider a user authenticated if they have a valid role other than anonymous
      const isAuthenticated = !!userToUse && userToUse.id && userToUse.role && userToUse.role !== 'anonymous';
      
      if (isAuthenticated) {
        if (debugMode) console.log('Setting authenticated user in auth store from page data');
        
        const newState = {
          isAuthenticated: true,
          user: userToUse,
          isLoading: false,
          hasChecked: true
        };
        
        authStore.set(newState);
        
        // Save to localStorage for persistence
        if (browser) {
          try {
            localStorage.setItem('auth_state', JSON.stringify({
              ...newState,
              timestamp: new Date().toISOString()
            }));
          } catch (error) {
            console.error('Error saving auth state to localStorage:', error);
          }
        }
      } else {
        if (debugMode) console.log('User data from server indicates not authenticated');
        
        const newState = {
          isAuthenticated: false,
          user: null,
          isLoading: false,
          hasChecked: true
        };
        
        authStore.set(newState);
        
        // Clear from localStorage
        if (browser) {
          try {
            localStorage.removeItem('auth_state');
          } catch (error) {
            console.error('Error removing auth state from localStorage:', error);
          }
        }
      }
    } else {
      if (debugMode) console.log('No user data in page store, checking current auth state');
      
      // Check if we already have an authenticated state in the store
      let currentState;
      authStore.update(state => {
        currentState = state;
        return state;
      });
      
      // If we're authenticated but page data doesn't have user info,
      // validate with server to ensure our state is correct
      if (currentState.isAuthenticated && currentState.user) {
        if (debugMode) console.log('Auth store has authenticated user but page data does not, validating with server');
        validateSessionWithServer().catch(err => {
          console.error('Error validating session after page update:', err);
        });
      } else {
        // Set unauthenticated state
        authStore.set({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          hasChecked: true
        });
      }
    }
  });
  
  // Also subscribe to auth store changes to persist them
  const authUnsubscribe = authStore.subscribe((state) => {
    if (browser && state.hasChecked && !state.isLoading) {
      try {
        if (state.isAuthenticated && state.user) {
          localStorage.setItem('auth_state', JSON.stringify({
            ...state,
            timestamp: new Date().toISOString()
          }));
        } else {
          localStorage.removeItem('auth_state');
        }
      } catch (error) {
        console.error('Error managing auth state in localStorage:', error);
      }
    }
  });
  
  // Clean up subscription on component unmount
  return () => {
    unsubscribe();
    authUnsubscribe();
  };
}

/**
 * Derived store for user role
 * Returns the user's role or 'anonymous' if not authenticated
 */
export const userRole = derived(authStore, ($authStore) => {
  return $authStore.user?.role || 'anonymous';
});

/**
 * Check if a user has a required role
 * @param {Object|null} user - User object or null if not authenticated
 * @param {string|Array} requiredRole - Required role or array of roles
 * @returns {boolean} Whether the user has the required role
 */
export function userHasRole(user, requiredRole) {
  // If no user, they have no roles
  if (!user) {
    return false;
  }
  
  // If the user is a superuser, they have access to everything
  if (user.role === 'superuser' || user.isSuperuser) {
    return true;
  }
  
  // If no role specified, any authenticated user is allowed
  if (!requiredRole) {
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
 * Validate the current session with the server
 * This ensures that the client and server states are synchronized
 * 
 * @param {boolean} force - Whether to force validation regardless of throttling
 * @param {boolean} isRetry - Whether this is a retry attempt
 * @param {number} retryCount - Current retry count (internal use)
 * @returns {Promise<Object|boolean>} - The validation result or false if throttled
 */
export async function validateSessionWithServer(force = false, isRetry = false, retryCount = 0) {
  if (!browser) return false;
  
  // Reset retry count if this is a new validation request (not a retry)
  if (!isRetry) {
    sessionRetryCount = 0;
  }
  
  // Throttle validation requests to avoid excessive API calls
  const now = Date.now();
  const timeSinceLastValidation = now - lastValidationTime;
  
  // Only validate once every 30 seconds unless forced or retrying
  if (!force && !isRetry && timeSinceLastValidation < 30000 && lastValidationTime > 0) {
    if (debugMode) console.log('Validation throttled, skipping');
    return false;
  }
  
  // Prevent multiple concurrent validation requests
  if (validationInProgress && !force && !isRetry) {
    if (debugMode) console.log('Validation already in progress, skipping');
    return false;
  }
  
  try {
    validationInProgress = true;
    if (!isRetry) lastValidationTime = now;
    
    if (debugMode) console.log(`Validating session with server${isRetry ? ` (retry ${retryCount}/${MAX_SESSION_RETRIES})` : ''}`);
    
    // Call the validation endpoint
    const response = await fetch('/api/auth/validate', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Session validation failed:', response.status);
      
      // If session validation failed with a 401 or 5xx error, retry a few times
      if ((response.status === 401 || response.status >= 500) && retryCount < MAX_SESSION_RETRIES) {
        console.log(`Session validation failed with status ${response.status}, retrying (${retryCount + 1}/${MAX_SESSION_RETRIES})...`);
        
        // Release the lock so we can retry
        validationInProgress = false;
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, SESSION_RETRY_DELAY));
        
        // Retry the validation
        return validateSessionWithServer(true, true, retryCount + 1);
      }
      
      // If unauthorized and we've exhausted retries, clear the auth state
      if (response.status === 401) {
        authStore.update(state => ({
          ...state,
          isAuthenticated: false,
          user: null,
          isLoading: false,
          hasChecked: true
        }));
        
        // Clear local storage auth state
        localStorage.removeItem('auth_state');
      }
      
      return false;
    }
    
    const data = await response.json();
    
    if (debugMode) console.log('Session validation result:', data);
    
    // Update auth store with server data
    if (data.authenticated) {
      // Check if the user is a superuser
      const isSuperuser = data.user?.role === 'superuser' || !!data.user?.isSuperuser;
      
      authStore.update(state => ({
        ...state,
        isAuthenticated: true,
        user: {
          ...data.user,
          isSuperuser
        },
        isLoading: false,
        hasChecked: true
      }));
      
      // Save auth state to localStorage for persistence
      try {
        const authState = {
          isAuthenticated: true,
          user: {
            ...data.user,
            isSuperuser
          },
          timestamp: now
        };
        
        localStorage.setItem('auth_state', JSON.stringify(authState));
      } catch (storageError) {
        console.error('Failed to save auth state to localStorage:', storageError);
      }
      
      return data;
    } else {
      // User is not authenticated
      authStore.update(state => ({
        ...state,
        isAuthenticated: false,
        user: null,
        isLoading: false,
        hasChecked: true
      }));
      
      // Clear local storage auth state
      localStorage.removeItem('auth_state');
      
      return false;
    }
  } catch (error) {
    console.error('Error validating session:', error);
    return false;
  } finally {
    validationInProgress = false;
  }
}

/**
 * Sign out the current user
 * This will end the session and redirect to the home page
 * 
 * @returns {Promise<boolean>} - Whether the sign out was successful
 */
export async function signOut() {
  try {
    if (debugMode) console.log('Auth: Signing out');
    
    // Make request to sign out
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    // Parse response
    const data = await response.json();
    
    if (debugMode) console.log('Auth: Sign out response:', data);

    // Update auth store based on response
    if (response.ok) {
      authStore.update(state => ({
        ...state,
        isAuthenticated: false,
        user: null,
        isLoading: false,
        hasChecked: true
      }));
      
      // Redirect to home page
      window.location.href = '/';
      
      return true;
    } else {
      // Handle error response
      console.error('Auth: Sign out error:', data);
      return false;
    }
  } catch (error) {
    // Handle network or other errors
    console.error('Auth: Error signing out:', error);
    return false;
  }
}

/**
 * Check if user is authenticated
 * @param {Object|null} user - User object or null
 * @returns {boolean} Whether the user is authenticated
 */
export function checkUserAuthenticated(user) {
  return !!user && !!user.id && user.active !== false;
}

/**
 * Get all available roles
 * @returns {Array} Array of role objects with name and label
 */
export function getAllRoles() {
  return [
    { name: 'visitor', label: 'Visitor' },
    { name: 'subscriber', label: 'Subscriber' },
    { name: 'editor', label: 'Editor' },
    { name: 'librarian', label: 'Librarian' },
    { name: 'admin', label: 'Administrator' },
    { name: 'superuser', label: 'Superuser' }
  ];
}

/**
 * Switch user role in development mode only
 * This is a client-side only function that updates the auth store with a new role
 * No server-side changes are made, and this only works in development mode
 * 
 * @param {string} newRole - The new role to switch to
 * @returns {boolean} Whether the role switch was successful
 */
export function switchRoleInDev(newRole) {
  // Only allow in development mode
  if (!isDev) {
    console.error('Role switching is only available in development mode');
    return false;
  }
  
  // Validate the role
  const validRoles = getAllRoles().map(r => r.name);
  if (!validRoles.includes(newRole)) {
    console.error(`Invalid role: ${newRole}. Must be one of: ${validRoles.join(', ')}`);
    return false;
  }
  
  try {
    // Get current auth state
    const currentAuth = get(authStore);
    
    if (!currentAuth.user) {
      console.error('Cannot switch role: No authenticated user');
      return false;
    }
    
    const originalRole = currentAuth.user.role;
    console.log(`[DEV] Switching role from ${originalRole} to ${newRole}`);
    
    // Create updated user with new role
    const updatedUser = {
      ...currentAuth.user,
      role: newRole,
      isSuperuser: newRole === 'superuser'
    };
    
    // Update auth store with new user data
    authStore.update(state => ({
      ...state,
      user: updatedUser,
      isAuthenticated: true, // Ensure we stay authenticated
      hasChecked: true,
      isLoading: false
    }));
    
    // Store in localStorage for persistence
    if (browser) {
      try {
        // Store the full auth state with the updated user
        const updatedAuthState = {
          ...currentAuth,
          user: updatedUser,
          isAuthenticated: true, // Ensure we stay authenticated
          hasChecked: true,
          isLoading: false,
          timestamp: new Date().toISOString() // Add current timestamp
        };
        
        localStorage.setItem('auth_state', JSON.stringify(updatedAuthState));
        
        // Also update the session claims in page data to ensure consistency
        if (window && window.__sveltekit_data) {
          try {
            const pageData = window.__sveltekit_data;
            for (const key in pageData) {
              if (pageData[key] && pageData[key].data && pageData[key].data.user) {
                pageData[key].data.user = updatedUser;
              }
            }
            console.log('[DEV] Updated page data with new role');
          } catch (e) {
            console.warn('Failed to update page data:', e);
          }
        }
        
        // Use a more gentle approach to update the UI without a full page reload
        // This prevents losing authentication state
        if (window.location) {
          // Use history.pushState to refresh the current page without a full reload
          const currentUrl = window.location.href;
          window.history.pushState({}, '', currentUrl);
          
          // Dispatch a custom event to notify components of the role change
          window.dispatchEvent(new CustomEvent('dev-role-changed', { 
            detail: { 
              newRole,
              originalRole,
              user: updatedUser
            } 
          }));
          
          // Force a re-render of the current page by triggering a popstate event
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } catch (e) {
        console.warn('Failed to save auth state to localStorage:', e);
      }
    }
    
    console.log(`[DEV] Role switched to ${newRole}`);
    return true;
  } catch (error) {
    console.error('Error switching role:', error);
    return false;
  }
}
