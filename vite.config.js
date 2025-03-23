import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import fs from 'fs';

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
        // Add the key as-is without adding another PUBLIC_ prefix
        env[key] = value.replace(/^['"]|['"]$/g, ''); // Remove quotes if present
      }
    });
  } else {
    // Fallback to Vite's env loading
    console.log('Loading environment variables from .env files');
    env = loadEnv(mode, root, 'PUBLIC_');
  }
  
  // Debug log the environment variables
  console.log('Loaded environment variables:');
  Object.keys(env).forEach(key => {
    console.log(`  ${key}: ${env[key] ? '[set]' : '[empty]'}`);
  });
  
  // Inject process.env for server-side use
  if (typeof process !== 'undefined') {
    Object.entries(env).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
  
  return {
    plugins: [
      tailwindcss(),
      sveltekit()
    ],
    // Use current directory for env files
    envDir: '.',
    // Define the env values to be injected
    define: {
      'process.env': env,
    },
    // Ensure node_modules from current directory are used
    resolve: {
      alias: {
        // This makes imports resolve to the local node_modules
        'node_modules': resolve(process.cwd(), 'node_modules')
      }
    },
    // File system access settings
    server: {
      host: '0.0.0.0', // Listen on all network interfaces
      port: 5173,
      strictPort: true, // Fail if port is already in use
      cors: true, // Enable CORS for all origins
      hmr: {
        protocol: 'ws',
        host: '0.0.0.0', // Changed from 'localhost' to '0.0.0.0' to allow external connections
        port: 5173,
        clientPort: 5173, // Added clientPort for browser connections
        timeout: 5000, // Increase timeout for slow connections
        overlay: true
      },
      watch: {
        usePolling: true, // Use polling for more reliable file watching in Docker
        interval: 1000
      },
      fs: {
        // Allow serving files from the current directory
        allow: ['.', './node_modules']
      }
    },
    // Handle external dependencies
    build: {
      commonjsOptions: {
        transformMixedEsModules: true
      },
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        external: ['@clerk/clerk-js']
      }
    },
    ssr: {
      noExternal: ['svelte-clerk']
    },
    optimizeDeps: {
      include: ['svelte-clerk']
    }
  };
});
