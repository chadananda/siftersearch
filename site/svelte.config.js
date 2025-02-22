import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter({
            out: 'build',
            precompress: true,
            envPrefix: 'APP_'
        }),
        csrf: {
            checkOrigin: true
        }
    }
};

export default config;
