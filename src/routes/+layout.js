// This file handles loading environment variables and making them available to the client
// SvelteKit auto-imports any variables prefixed with PUBLIC_ from the root .env file

// Export the load function that SvelteKit calls
export function load() {
  // Get environment variables
  let env = {};
  
  try {
    // Access environment variables
    // These should be populated from .env-public by vite.config.js
    if (typeof import.meta !== 'undefined') {
      env = {
        CLERK_PUBLISHABLE_KEY: import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY || '',
        APP_NAME: import.meta.env.PUBLIC_APP_NAME || '',
      };
      
      // Validate required environment variables
      if (!env.CLERK_PUBLISHABLE_KEY) {
        console.error('ERROR: CLERK_PUBLISHABLE_KEY not set. Authentication will not work properly.');
      }
    }
  } catch (error) {
    console.error('Error loading environment variables:', error);
  }
  
  return {
    // Return environment variables to make them available in the layout
    env
  };
}
