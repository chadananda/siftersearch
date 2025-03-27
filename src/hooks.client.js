// Client-side hooks for SvelteKit
import { initializeClerkClient } from 'clerk-sveltekit/client';

// Initialize Clerk with publishable key from environment
// The key will be injected during build time by Vite
const publishableKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;

// Check if publishable key is available
if (!publishableKey) {
  console.error('ERROR: PUBLIC_CLERK_PUBLISHABLE_KEY not set. Authentication will not work properly.');
} else {
  console.log('Initializing Clerk with publishable key:', publishableKey.substring(0, 10) + '...');
  
  // Initialize Clerk client
  try {
    initializeClerkClient(publishableKey, {
      afterSignInUrl: '/',
      afterSignUpUrl: '/',
      signInUrl: '/sign-in',
      signUpUrl: '/sign-up'
      // Removed appearance settings that were causing errors
    });
    console.log('Clerk client initialized successfully');
  } catch (error) {
    console.error('Error initializing Clerk client:', error);
  }
}

// Export init function for SvelteKit
export const init = () => {
  // This function is required by SvelteKit but we've already initialized Clerk above
  return {};
};

export const handleError = ({ error, event }) => {
  console.error('Client-side error:', error);
  return {
    message: 'An unexpected error occurred',
    code: error?.code || 'UNKNOWN'
  };
};
