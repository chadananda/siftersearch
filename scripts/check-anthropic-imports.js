// STATIC GUARD (layer 2 of the Anthropic spend lockdown — see api/lib/anthropic-policy.js).
// Fails if the Anthropic SDK is imported or a client is constructed anywhere in the runtime surface (api/**)
// except the SANCTIONED, gated client files — and fails if a sanctioned file holds a client WITHOUT going through
// the fail-closed gate. This makes it impossible to reopen the bypass that once billed Sonnet on non-Persian
// content: any new ungated Anthropic client trips this check (run by `npm test`, so the pre-commit hook enforces it).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIR = join(ROOT, 'api');

// The ONLY files permitted to touch the Anthropic SDK. Each MUST also reference the gate (assertAnthropicAllowed).
const SANCTIONED = new Set(['api/lib/ai.js', 'api/lib/ai-services.js']);
const SDK_RE = /@anthropic-ai\/sdk|new\s+Anthropic\s*\(/;
const GATE_RE = /assertAnthropicAllowed/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Returns an array of violation strings (empty = clean). Exported so a test can assert on it. */
export function findAnthropicViolations() {
  const violations = [];
  for (const file of walk(SCAN_DIR)) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    const touchesSdk = SDK_RE.test(src);
    if (touchesSdk && !SANCTIONED.has(rel)) {
      violations.push(`${rel}: constructs/imports the Anthropic SDK but is not a sanctioned gated client. Route Anthropic calls through api/lib/ai.js (chatCompletion), which enforces the Persian-plan spend gate.`);
    }
    if (touchesSdk && SANCTIONED.has(rel) && !GATE_RE.test(src)) {
      violations.push(`${rel}: is a sanctioned Anthropic client but does not reference assertAnthropicAllowed — the fail-closed gate must be applied to every Anthropic call.`);
    }
  }
  return violations;
}

// CLI: node scripts/check-anthropic-imports.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const v = findAnthropicViolations();
  if (v.length) {
    console.error('✗ Anthropic import guard FAILED — ungated Anthropic access detected:\n' + v.map((s) => '  • ' + s).join('\n'));
    process.exit(1);
  }
  console.log('✓ Anthropic import guard: no ungated Anthropic clients in api/.');
}
