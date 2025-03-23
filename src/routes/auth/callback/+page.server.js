// Server-side handler for Clerk authentication callbacks
import { redirect } from '@sveltejs/kit';
import { withClerkHandler } from 'svelte-clerk/server';

/** @type {import('./$types').PageServerLoad} */
export async function load({ request, url, locals }) {
  console.log("Auth callback route hit");
  
  // Clerk handles the authentication callback automatically through the middleware
  // Just redirect to the home page after authentication
  throw redirect(302, '/');
}

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ request, locals }) => {
    // Form submissions are handled by the Clerk middleware
    return { success: true };
  }
};
