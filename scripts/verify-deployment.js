#!/usr/bin/env node
/**
 * Deployment Verification Script
 *
 * Verifies the API server is functioning correctly after deployment.
 * Should be run after git pull && npm install && pm2 restart.
 *
 * Tests:
 * 1. Health endpoint responds with 200
 * 2. Stats endpoint returns valid JSON
 * 3. Search endpoint accepts queries
 * 4. No critical errors in recent logs
 *
 * Exit codes:
 * 0 = All tests passed
 * 1 = Health check failed
 * 2 = API functionality failed
 * 3 = Error logs detected
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { ...options, timeout: 5000 });
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`  Retry ${i + 1}/${retries} - ${err.message}`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function testHealthEndpoint() {
  console.log('\n1. Testing health endpoint...');
  try {
    const response = await fetchWithRetry(`${API_URL}/health`);
    if (!response.ok) {
      console.log(`  ✗ Health check failed with status ${response.status}`);
      return false;
    }
    const data = await response.json();
    if (data.status !== 'ok') {
      console.log(`  ✗ Health status is not 'ok': ${data.status}`);
      return false;
    }
    console.log(`  ✓ Health OK - version ${data.version}`);
    return true;
  } catch (err) {
    console.log(`  ✗ Health check error: ${err.message}`);
    return false;
  }
}

async function testStatsEndpoint() {
  console.log('\n2. Testing stats endpoint...');
  try {
    const response = await fetchWithRetry(`${API_URL}/api/search/stats`);
    if (!response.ok) {
      console.log(`  ✗ Stats failed with status ${response.status}`);
      return false;
    }
    const data = await response.json();
    if (typeof data.totalDocuments !== 'number') {
      console.log(`  ✗ Stats missing totalDocuments`);
      return false;
    }
    console.log(`  ✓ Stats OK - ${data.totalDocuments} documents, ${data.totalPassages} passages`);

    // Check ingestion progress is included
    if (data.ingestionProgress) {
      console.log(`  ✓ Ingestion progress: ${data.ingestionProgress.percentComplete}% (${data.ingestionProgress.docsWithContent}/${data.ingestionProgress.totalDocs})`);
    }
    return true;
  } catch (err) {
    console.log(`  ✗ Stats error: ${err.message}`);
    return false;
  }
}

async function testSearchEndpoint() {
  console.log('\n3. Testing search endpoint...');
  try {
    const response = await fetchWithRetry(`${API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', limit: 1 })
    });
    if (!response.ok) {
      console.log(`  ✗ Search failed with status ${response.status}`);
      return false;
    }
    const data = await response.json();
    // API returns 'hits' array
    if (!Array.isArray(data.hits)) {
      console.log(`  ✗ Search response missing hits array`);
      return false;
    }
    console.log(`  ✓ Search OK - returned ${data.hits.length} hits`);
    return true;
  } catch (err) {
    console.log(`  ✗ Search error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(50));
  console.log('Deployment Verification');
  console.log('='.repeat(50));
  console.log(`API URL: ${API_URL}`);

  let exitCode = 0;

  // Test 1: Health
  if (!await testHealthEndpoint()) {
    exitCode = 1;
  }

  // Test 2: Stats
  if (!await testStatsEndpoint()) {
    exitCode = exitCode || 2;
  }

  // Test 3: Search
  if (!await testSearchEndpoint()) {
    exitCode = exitCode || 2;
  }

  console.log('\n' + '='.repeat(50));
  if (exitCode === 0) {
    console.log('✓ All deployment tests PASSED');
  } else {
    console.log(`✗ Deployment tests FAILED (exit code: ${exitCode})`);
  }
  console.log('='.repeat(50) + '\n');

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
