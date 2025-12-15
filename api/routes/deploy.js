/**
 * Deploy Routes
 *
 * Webhook endpoints for deployment automation.
 * Uses secret key authentication (not user auth).
 *
 * POST /api/deploy/trigger-update - Trigger server update from git
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

// Get deploy secret from environment
const DEPLOY_SECRET = config.get('DEPLOY_SECRET');

export default async function deployRoutes(fastify) {
  /**
   * Trigger server update
   * Called by client when it detects version mismatch
   */
  fastify.post('/trigger-update', {
    schema: {
      body: {
        type: 'object',
        properties: {
          secret: { type: 'string' },
          clientVersion: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { secret, clientVersion } = request.body || {};

    // Validate secret
    if (!DEPLOY_SECRET) {
      logger.warn('Deploy secret not configured');
      return reply.status(503).send({ error: 'Deploy not configured' });
    }

    if (secret !== DEPLOY_SECRET) {
      logger.warn({ clientVersion }, 'Invalid deploy secret');
      return reply.status(401).send({ error: 'Invalid secret' });
    }

    logger.info({ clientVersion }, 'Update triggered by client');

    // Run update script in background (don't wait)
    const scriptPath = join(process.cwd(), 'scripts', 'update-server.js');

    const child = spawn('node', [scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd()
    });

    child.unref();

    return {
      success: true,
      message: 'Update triggered',
      clientVersion
    };
  });

  /**
   * Health check for deploy system
   */
  fastify.get('/status', async () => {
    return {
      configured: !!DEPLOY_SECRET,
      serverVersion: pkg.version
    };
  });
}
