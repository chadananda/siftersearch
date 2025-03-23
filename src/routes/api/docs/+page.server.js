// src/routes/api/docs/+page.server.js
import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  // Redirect to the static Swagger UI
  throw redirect(307, '/api-docs/');
}
