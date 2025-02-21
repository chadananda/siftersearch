import { PUBLIC_CLERK_PUBLISHABLE_KEY } from '$env/static/public';
import { Clerk } from '@clerk/clerk-js';

export const clerk = new Clerk(PUBLIC_CLERK_PUBLISHABLE_KEY);

export async function initClerk() {
  if (!clerk.isReady) {
    await clerk.load();
  }
  return clerk;
}

export function getAuthHeaders() {
  const sessionId = clerk.session?.id;
  const token = clerk.session?.getToken();
  return {
    'Authorization': `Bearer ${token}`,
    'X-Session-Id': sessionId
  };
}