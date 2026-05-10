#!/usr/bin/env node
// Tiny smoke test — single-request batch to Anthropic. If this fails too,
// the API itself is having a problem. If it succeeds, our 2500 batch size
// is the issue.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60000 });

const requests = [{
  custom_id: 'test1',
  params: {
    model: 'claude-sonnet-4-6',
    max_tokens: 50,
    system: 'You are a test assistant.',
    messages: [{ role: 'user', content: 'Say "hi" in one word.' }]
  }
}];

console.log('Submitting tiny batch...');
const t0 = Date.now();
try {
  const batch = await client.messages.batches.create({ requests });
  console.log('SUCCESS:', batch.id, `(${Date.now() - t0}ms)`);
  console.log('Status:', batch.processing_status);
} catch (err) {
  console.error('FAILED:', err.status, err.message);
  console.error('Full error:', JSON.stringify({
    name: err.name,
    message: err.message,
    status: err.status,
    error: err.error,
    headers: err.headers
  }, null, 2));
}
