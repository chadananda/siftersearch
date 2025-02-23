import { redirect } from '@sveltejs/kit';
import { getAuth } from 'clerk-sveltekit/server';

export async function load(event) {
  const { userId } = await getAuth(event);
  if (!userId) {
    throw redirect(303, '/');
  }
  
  return {
    userId
  };
}
