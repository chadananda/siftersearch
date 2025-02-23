import { sequence } from '@sveltejs/kit/hooks';
import { createClerkClient } from '@clerk/backend';
import { CLERK_SECRET_KEY } from '$env/static/private';

const clerk = CLERK_SECRET_KEY ? createClerkClient({ secretKey: CLERK_SECRET_KEY }) : null;

/** @type {import('@sveltejs/kit').Handle} */
export const handle = async ({ event, resolve }) => {
  try {
    if (!clerk) {
      console.warn('Clerk not initialized - missing secret key');
      event.locals.session = null;
      event.locals.user = null;
      return resolve(event);
    }

    const sessionId = event.cookies.get('__session');
    if (!sessionId) {
      event.locals.session = null;
      event.locals.user = null;
      return resolve(event);
    }

    const session = await clerk.sessions.getSession(sessionId);
    event.locals.session = session;
    event.locals.user = session ? await clerk.users.getUser(session.userId) : null;
  } catch (error) {
    console.error('Auth error:', error);
    event.locals.session = null;
    event.locals.user = null;
  }

  return resolve(event);
};
