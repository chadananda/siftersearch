/** @type {import('@sveltejs/kit').LayoutServerLoad} */
export async function load({ locals }) {
  return {
    user: locals.user
  };
}
