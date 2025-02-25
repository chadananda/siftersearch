import { redirect } from '@sveltejs/kit';

export const actions = {
  default: async ({ locals }) => {
    if (!locals.user) {
      throw redirect(303, '/auth/signin');
    }
    throw redirect(303, '/');
  }
};
