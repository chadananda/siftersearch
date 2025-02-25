import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(__dirname, '..', '.env');

// Read and parse the root .env file
const loadRootEnv = () => {
  try {
    const envContent = fs.readFileSync(rootEnvPath, 'utf-8');
    const env = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        env[key.trim()] = value.trim();
      }
    });
    return env;
  } catch (error) {
    console.error('Error loading root .env file:', error);
    return {};
  }
};

export default defineConfig(() => {
  const rootEnv = loadRootEnv();
  
  return {
    plugins: [
      tailwindcss(),
      sveltekit()
    ],
    define: {
      'process.env.CLERK_SECRET_KEY': JSON.stringify(rootEnv.CLERK_SECRET_KEY),
      'process.env.PUBLIC_CLERK_PUBLISHABLE_KEY': JSON.stringify(rootEnv.PUBLIC_CLERK_PUBLISHABLE_KEY)
    }
  };
});
