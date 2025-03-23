import { redirect } from '@sveltejs/kit';
import { getAuth } from 'svelte-clerk/server';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url }) {
  const { userId } = getAuth(locals);
  
  // Only the callback route is needed for Google One Tap
  // Redirect to home if trying to access other auth routes
  if (!url.pathname.includes('/callback')) {
    throw redirect(303, '/');
  }
  
  return {
    userId
  };
}
