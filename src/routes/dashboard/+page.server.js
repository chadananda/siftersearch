import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
  // Check if the user is authenticated
  if (!locals.user) {
    // Redirect to sign in page if not authenticated
    // Include the current path as redirect URL after authentication
    const redirectTo = encodeURIComponent(url.pathname);
    throw redirect(303, `/auth/signin?redirect=${redirectTo}`);
  }
  
  return {
    userId: locals.user.id
  };
}
