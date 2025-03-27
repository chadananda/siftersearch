/**
 * Simple script to check environment variables
 */
import { PUBLIC, SECRETS } from '../config/config.js';

console.log('Environment Variables:');
console.log('=====================');
console.log('PUBLIC_MANTICORE_ENABLED:', PUBLIC.PUBLIC_MANTICORE_ENABLED);
console.log('MANTICORE_ENABLED:', PUBLIC.MANTICORE_ENABLED);
console.log('IS_DEV:', PUBLIC.IS_DEV);

// Check if Clerk keys are defined
console.log('PUBLIC_CLERK_PUBLISHABLE_KEY defined:', !!PUBLIC.PUBLIC_CLERK_PUBLISHABLE_KEY);
console.log('CLERK_SECRET_KEY defined:', !!SECRETS.CLERK_SECRET_KEY);
