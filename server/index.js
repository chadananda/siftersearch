// server/index.js
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import { clerkPlugin } from '@clerk/fastify';

// Load environment variables
dotenv.config();

// Get the directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const buildDir = join(rootDir, 'build');

// Create Fastify instance
const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production',
  trustProxy: true
});

// Register plugins
async function registerPlugins() {
  // CORS
  await fastify.register(fastifyCors, {
    origin: true,
    credentials: true
  });

  // Clerk authentication
  await fastify.register(clerkPlugin, {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  });

  // Register static file serving for SvelteKit build
  await fastify.register(fastifyStatic, {
    root: buildDir,
    prefix: '/',
    decorateReply: false
  });

  // Register API routes
  await fastify.register(import('./plugins/db.js'));
  await fastify.register(import('./plugins/storage.js'));
  await fastify.register(import('./routes/api/index.js'), { prefix: '/api' });
}

// Start the server
async function start() {
  try {
    await registerPlugins();

    // Add a catch-all route for SvelteKit SSR
    fastify.get('*', async (request, reply) => {
      // This will serve the SvelteKit app for all non-API routes
      return reply.sendFile('index.html');
    });

    // Start the server
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`Server is running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
