import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url }) {
  // Access the session from locals which is populated by the handleClerk middleware
  const userId = locals.session?.userId;
  
  // Only the callback route is needed for Google One Tap
  // Redirect to home if trying to access other auth routes
  if (!url.pathname.includes('/callback')) {
    throw redirect(303, '/');
  }
  
  return {
    userId
  };
}
