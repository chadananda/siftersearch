import { redirect } from '@sveltejs/kit';

export const POST = async ({ locals }) => {
  if (locals.session) {
    await locals.session.destroy();
  }
  throw redirect(303, '/');
};
