// Client-side hooks for SvelteKit
// No initialization needed for svelte-clerk 0.10.2
// The ClerkProvider component in +layout.svelte handles initialization

export const handleError = ({ error, event }) => {
  console.error('Client-side error:', error);
  return {
    message: 'An unexpected error occurred',
    code: error?.code || 'UNKNOWN'
  };
};
