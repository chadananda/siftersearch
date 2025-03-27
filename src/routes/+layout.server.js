import { PUBLIC } from '../../config/config.js';

/** @type {import('@sveltejs/kit').LayoutServerLoad} */
export async function load({ locals }) {
  // Debug the state of locals.dbUser
  console.log('Layout server load - User from locals:', 
    locals.dbUser ? `${locals.dbUser.email} (${locals.dbUser.role})` : 'No user data');
  
  return {
    user: locals.dbUser,
    env: {
      PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLIC.CLERK_PUBLISHABLE_KEY
    }
  };
}
