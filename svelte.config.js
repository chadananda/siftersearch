import adapterNode from '@sveltejs/adapter-node';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Determine which adapter to use based on environment
const isCloudflare = process.env.ADAPTER === 'cloudflare';
const adapter = isCloudflare ? adapterCloudflare : adapterNode;

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            out: 'build',
            precompress: true,
            // Don't try to resolve dependencies, use the ones from the parent project
            deps: {
                inline: []
            }
        }),
        csrf: {
            checkOrigin: true
        },
        // Add environment variables that should be available to the client
        env: {
            publicPrefix: 'PUBLIC_'
        }
    }
};

export default config;
