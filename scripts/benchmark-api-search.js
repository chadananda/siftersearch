#!/usr/bin/env node
/**
 * Search API Performance Benchmark
 *
 * Measures search response times and cache effectiveness.
 * Run: node scripts/benchmark-api-search.js [--local]
 */

import { performance } from 'perf_hooks';

// Default to production server (API subdomain)
const BASE_URL = process.argv.includes('--local')
  ? 'http://localhost:7839'
  : 'https://api.siftersearch.com';

// Common search queries to benchmark
const BENCHMARK_QUERIES = [
  // Short queries (most common)
  'prayer',
  'love',
  'God',
  'unity',
  'peace',
  'justice',
  'faith',
  'truth',
  // Multi-word queries
  'divine unity',
  'world peace',
  'spiritual growth',
  'religious harmony',
  // Complex queries
  'what is the purpose of life',
  'how to find inner peace',
  'teachings about love and kindness',
  // Specific terms
  "Bahá'u'lláh",
  'meditation techniques',
  'golden rule'
];

// Popular query patterns to pre-warm
export const POPULAR_QUERIES = [
  // Core concepts
  'prayer',
  'love',
  'God',
  'faith',
  'peace',
  'unity',
  'justice',
  'truth',
  'soul',
  'spirit',
  // Common phrases
  'divine unity',
  'spiritual growth',
  'world peace',
  'inner peace',
  'life purpose',
  // Central figures
  "Bahá'u'lláh",
  "Abdu'l-Baha",
  'Shoghi Effendi',
  // Practices
  'meditation',
  'fasting',
  'pilgrimage'
];

async function benchmarkQuery(query) {
  const url = `${BASE_URL}/api/search/quick?q=${encodeURIComponent(query)}&limit=10`;

  const start = performance.now();
  try {
    const response = await fetch(url);
    const elapsed = performance.now() - start;

    if (!response.ok) {
      return {
        query,
        status: response.status,
        error: true,
        elapsedMs: elapsed
      };
    }

    const data = await response.json();

    return {
      query,
      status: 200,
      elapsedMs: elapsed,
      hits: data.hits?.length || 0,
      totalHits: data.estimatedTotalHits || 0,
      cached: data.cached || false,
      processingTimeMs: data.processingTimeMs || 0
    };
  } catch (err) {
    return {
      query,
      error: true,
      errorMessage: err.message,
      elapsedMs: performance.now() - start
    };
  }
}

async function runBenchmark(iterations = 2) {
  console.log(`\n🔍 Search API Performance Benchmark`);
  console.log(`   Server: ${BASE_URL}`);
  console.log(`   Queries: ${BENCHMARK_QUERIES.length}`);
  console.log(`   Iterations: ${iterations}\n`);

  const results = [];
  const cacheResults = [];

  // First pass: Cold cache
  console.log('📊 Pass 1: Cold Cache');
  console.log('─'.repeat(60));

  for (const query of BENCHMARK_QUERIES) {
    const result = await benchmarkQuery(query);
    results.push({ ...result, pass: 1 });

    const status = result.error ? '❌' : (result.cached ? '📦' : '🔥');
    const time = result.elapsedMs.toFixed(0).padStart(4);
    console.log(`${status} ${time}ms | ${result.hits || 0} hits | ${query}`);

    // Small delay between queries to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  // Second pass: Warm cache
  console.log('\n📊 Pass 2: Warm Cache');
  console.log('─'.repeat(60));

  for (const query of BENCHMARK_QUERIES) {
    const result = await benchmarkQuery(query);
    cacheResults.push({ ...result, pass: 2 });

    const status = result.error ? '❌' : (result.cached ? '📦' : '🔥');
    const time = result.elapsedMs.toFixed(0).padStart(4);
    console.log(`${status} ${time}ms | ${result.hits || 0} hits | ${query}`);

    await new Promise(r => setTimeout(r, 50));
  }

  // Summary statistics
  console.log('\n📈 Summary Statistics');
  console.log('─'.repeat(60));

  const coldTimes = results.filter(r => !r.error).map(r => r.elapsedMs);
  const warmTimes = cacheResults.filter(r => !r.error).map(r => r.elapsedMs);

  const coldStats = calculateStats(coldTimes);
  const warmStats = calculateStats(warmTimes);

  console.log('\n   Cold Cache (first pass):');
  console.log(`   ├─ Mean:    ${coldStats.mean.toFixed(0)}ms`);
  console.log(`   ├─ Median:  ${coldStats.median.toFixed(0)}ms`);
  console.log(`   ├─ Min:     ${coldStats.min.toFixed(0)}ms`);
  console.log(`   ├─ Max:     ${coldStats.max.toFixed(0)}ms`);
  console.log(`   └─ P95:     ${coldStats.p95.toFixed(0)}ms`);

  console.log('\n   Warm Cache (second pass):');
  console.log(`   ├─ Mean:    ${warmStats.mean.toFixed(0)}ms`);
  console.log(`   ├─ Median:  ${warmStats.median.toFixed(0)}ms`);
  console.log(`   ├─ Min:     ${warmStats.min.toFixed(0)}ms`);
  console.log(`   ├─ Max:     ${warmStats.max.toFixed(0)}ms`);
  console.log(`   └─ P95:     ${warmStats.p95.toFixed(0)}ms`);

  const cacheHits = cacheResults.filter(r => r.cached).length;
  const cacheHitRate = (cacheHits / cacheResults.length * 100).toFixed(1);

  console.log('\n   Cache Effectiveness:');
  console.log(`   ├─ Cache Hit Rate:  ${cacheHitRate}%`);
  console.log(`   ├─ Speed Improvement: ${((coldStats.mean - warmStats.mean) / coldStats.mean * 100).toFixed(1)}%`);
  console.log(`   └─ Errors: ${results.filter(r => r.error).length + cacheResults.filter(r => r.error).length}`);

  console.log('\n   Legend: 🔥 Fresh | 📦 Cached | ❌ Error\n');

  return { results, cacheResults, coldStats, warmStats };
}

function calculateStats(times) {
  if (times.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, p95: 0 };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    mean: sum / sorted.length,
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[Math.floor(sorted.length * 0.95)]
  };
}

// Run if executed directly
runBenchmark().catch(console.error);

export { runBenchmark, benchmarkQuery, calculateStats };
