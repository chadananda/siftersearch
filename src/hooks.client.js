// Client-side hooks for SvelteKit
import { initializeClerkClient } from 'clerk-sveltekit/client';

// Initialize Clerk with publishable key from environment
// The key will be injected during build time
const publishableKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;

// Check if publishable key is available
if (!publishableKey) {
  console.error('ERROR: CLERK_PUBLISHABLE_KEY not set. Authentication will not work properly.');
}

// Initialize Clerk client
initializeClerkClient(publishableKey, {
  afterSignInUrl: '/',
  afterSignUpUrl: '/',
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
});

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
