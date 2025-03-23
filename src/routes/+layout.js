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
        CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY || '',
        APP_NAME: import.meta.env.PUBLIC_APP_NAME || 'SifterSearch',
      };
      
      // Log available environment variables in development
      if (import.meta.env.DEV) {
        console.log('Available environment variables in layout.js:');
        Object.keys(import.meta.env)
          .filter(key => key.startsWith('PUBLIC_') || key.startsWith('VITE_'))
          .forEach(key => {
            console.log(`  ${key}: ${import.meta.env[key] ? '[set]' : '[empty]'}`);
          });
      }
    }
    
    // Add fallback for Clerk key if not set
    if (!env.CLERK_PUBLISHABLE_KEY) {
      console.warn('CLERK_PUBLISHABLE_KEY not set. Using development fallback key.');
      // Use the key from your .env-public file
      env.CLERK_PUBLISHABLE_KEY = 'pk_test_cHJvcGVyLXB5dGhvbi0zNi5jbGVyay5hY2NvdW50cy5kZXYk';
    }
  } catch (error) {
    console.error('Error loading environment variables:', error);
  }
  
  return {
    // Return environment variables to make them available in the layout
    env
  };
}
