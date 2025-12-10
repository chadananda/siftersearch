/**
 * Pino Logger Configuration
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

// Logger configuration object (for Fastify)
export const loggerConfig = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      }
    }
  })
};

// Logger instance (for direct use outside Fastify)
export const logger = pino(loggerConfig);

export default logger;
