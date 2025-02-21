import { createServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ESM __dirname equivalent
const __dirname = dirname(fileURLToPath(import.meta.url));

async function startDevServer() {
  try {
    // Create Vite server for SvelteKit
    const vite = await createServer({
      configFile: resolve(__dirname, 'site/vite.config.js'),
      root: resolve(__dirname, 'site'),
      server: {
        middlewareMode: true,
        hmr: {
          port: 24678 // Default Vite HMR port
        }
      }
    });

    // Create Fastify server
    const app = fastify({ logger: true });

    // Register Fastify plugins
    await app.register(fastifyCors);
    await app.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '1 minute'
    });

    // Register API routes
    app.register(import('./server/routes/content.js'));
    app.register(import('./server/routes/users.js'));
    app.register(import('./server/routes/tools.js'));
    app.register(import('./server/routes/chat.js'));
    app.register(import('./server/routes/api-keys.js'));
    app.register(import('./server/routes/init.js'));

    // Handle SvelteKit requests
    app.all('/*', async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'API route not found' });
      }

      try {
        // Use Vite's middleware to handle SvelteKit requests
        await vite.middlewares(request.raw, reply.raw);
      } catch (e) {
        console.error(e);
        reply.code(500).send('Internal Server Error');
      }
    });

    // Start the server
    await app.listen({ port: 3000 });
    console.log('🚀 Dev server running at http://localhost:3000');
    console.log('📝 API endpoints available at http://localhost:3000/api');
  } catch (e) {
    console.error('Failed to start dev server:', e);
    process.exit(1);
  }
}

startDevServer();