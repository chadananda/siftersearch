import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Using adapter-node for Docker container deployment
		adapter: adapter({
			// Customize Node adapter settings if needed
			out: 'build',
			precompress: true,
			envPrefix: ''  // Allow all env vars to be exposed, relying on our config.js to control what's public
		}),
		csrf: {
			checkOrigin: false
		}
	}
};

export default config;
