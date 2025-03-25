import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwind from '@tailwindcss/vite';
import { resolve } from 'path';
import fs from 'fs';

// Import custom tailwind config from config directory
import tailwindConfig from './config/tailwind.js';

export default defineConfig(({ mode }) => {
  // Load env files from project root
  const root = process.cwd();
  
  // Try to load from .env-public first
  let env = {};
  const envPublicPath = resolve(root, '.env-public');
  
  if (fs.existsSync(envPublicPath)) {
    console.log('Loading environment variables from .env-public');
    // Custom parsing of .env-public file
    const content = fs.readFileSync(envPublicPath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach(line => {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') return;
      
      const [key, value] = line.split('=').map(part => part.trim());
      if (key && value) {
        // Add the key as-is
        env[key] = value.replace(/^['"]|['"]$/g, ''); // Remove quotes if present
      }
    });
  } else {
    // Fallback to Vite's env loading
    console.log('Loading environment variables from .env files');
    env = loadEnv(mode, root, '');
  }
  
  // Inject process.env for server-side use
  if (typeof process !== 'undefined') {
    Object.entries(env).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
  
  return {
    plugins: [
      sveltekit(),
      tailwind({
        config: tailwindConfig
      })
    ],
    server: {
      fs: {
        // Allow serving files from one level up to the project root
        allow: ['..']
      },
      host: '0.0.0.0',
      port: 3000,
      strictPort: false
    },
    // Use PUBLIC_ prefix for client-side environment variables
    envPrefix: 'PUBLIC_',
    build: {
      target: 'esnext',
      sourcemap: true
    }
  };
});
