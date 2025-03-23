/**
 * Cloudflare Tunnel Configuration Generator
 * This script generates the configuration for Cloudflare Tunnel
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration options
const config = {
  tunnel: process.env.CLOUDFLARE_TUNNEL_ID || '',
  "credentials-file": process.env.CLOUDFLARE_CREDENTIALS_FILE || '/etc/cloudflared/credentials.json',
  ingress: [
    // Route traffic to the SvelteKit app
    {
      hostname: process.env.PUBLIC_DOMAIN || 'siftersearch.com',
      service: 'http://app:3000'
    },
    // Route API traffic to the SvelteKit app
    {
      hostname: `api.${process.env.PUBLIC_DOMAIN || 'siftersearch.com'}`,
      service: 'http://app:3000/api'
    },
    // Route Manticore traffic to the Manticore service (for admin access)
    {
      hostname: `manticore.${process.env.PUBLIC_DOMAIN || 'siftersearch.com'}`,
      service: 'http://manticore:9308'
    },
    // Default catch-all route
    {
      service: 'http_status:404'
    }
  ],
  // Outbound configuration
  outbound: [
    {
      via: process.env.CLOUDFLARE_OUTBOUND_NAME || 'default'
    }
  ],
  // Connection options
  "connection-options": {
    "compression": true,
    "tcp-keepalive": "30s",
    "no-happy-eyeballs": false,
    "keepalive-connections": 100,
    "keepalive-timeout": "1m30s",
    "http2-origin": true
  },
  // Metrics
  metrics: '0.0.0.0:9090',
  "no-autoupdate": true
};

// Output file path
const outputPath = path.resolve(__dirname, '..', 'cloudflared-config.json');

try {
  // Write the configuration to a file
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
  console.log(`Cloudflare Tunnel configuration written to ${outputPath}`);
} catch (error) {
  console.error('Error writing Cloudflare Tunnel configuration:', error);
  process.exit(1);
}
