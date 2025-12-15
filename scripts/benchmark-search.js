#!/usr/bin/env node
/**
 * Search Performance Benchmark
 *
 * Tests different model/configuration combinations to find optimal settings.
 *
 * Usage: node scripts/benchmark-search.js
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { ai } from '../api/lib/ai.js';

const TEST_QUERY = "what is the meaning of justice";
const TEST_PASSAGES = [
  {
    id: "p1",
    title: "Hidden Words",
    author: "Bahá'u'lláh",
    text: "O Son of Spirit! The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me, and neglect it not that I may confide in thee. By its aid thou shalt see with thine own eyes and not through the eyes of others."
  },
  {
    id: "p2",
    title: "Gleanings",
    author: "Bahá'u'lláh",
    text: "The light of men is Justice. Quench it not with the contrary winds of oppression and tyranny. The purpose of justice is the appearance of unity among men."
  },
  {
    id: "p3",
    title: "Administration Notes",
    author: "Shoghi Effendi",
    text: "Justice in social relations, mercy in individual relations. Facing responsibility is a sort of spiritual sustenance. The first thing is to face, not shirk responsibilities."
  },
  {
    id: "p4",
    title: "Pilgrimage Notes",
    author: "Emogene Hoagg",
    text: "The Justice and Mercy of God is a very difficult subject. The meaning of Justice is not equality, but the giving to every one according to his right."
  },
  {
    id: "p5",
    title: "Ten Days in Akka",
    author: "Julia Grundy",
    text: "The House of Justice will decide between kings and kings. All judgment will be from the standpoint of God's Laws. Then rich and poor will be alike justly treated."
  },
  {
    id: "p6",
    title: "Portals to Freedom",
    author: "Howard Ives",
    text: "Verily justice is My gift to thee and the sign of My loving-kindness. Set it then before thine eyes. Ponder this in thy heart; how it behoveth thee to be."
  },
  {
    id: "p7",
    title: "Paris Talks",
    author: "Abdu'l-Bahá",
    text: "Divine justice will become manifest in the world, and all mankind will see it. Justice will rule; the great and the small will be judged with one measure."
  },
  {
    id: "p8",
    title: "Some Answered Questions",
    author: "Abdu'l-Bahá",
    text: "True justice consists in giving every creature its due; but the justice of nature considers only bodily strength. Spiritual justice considers virtue and merit."
  },
  {
    id: "p9",
    title: "World Order Letters",
    author: "Shoghi Effendi",
    text: "The principle of collective security demands that the ideal of justice be established as the ruling principle of human society."
  },
  {
    id: "p10",
    title: "Promise of World Peace",
    author: "Universal House of Justice",
    text: "Justice is the one power that can translate the dawning consciousness of humanity's oneness into a collective will through which necessary structures can be erected."
  }
];

// Additional passages for 20-passage test
const MORE_PASSAGES = [
  { id: "p11", title: "Kitab-i-Aqdas", author: "Bahá'u'lláh", text: "We have enjoined upon rulers and ministers to judge with justice. Without justice the world would be in chaos and confusion." },
  { id: "p12", title: "Tablets of Bahá'u'lláh", author: "Bahá'u'lláh", text: "The sword of a virtuous character and upright conduct is sharper than blades of steel. The foundation of justice is trust." },
  { id: "p13", title: "Secret of Divine Civilization", author: "Abdu'l-Bahá", text: "Justice and equity are twin guardians of the human race. They watch over the interests of the body politic." },
  { id: "p14", title: "Promulgation of Universal Peace", author: "Abdu'l-Bahá", text: "In the world of humanity we find injustice; rights are often trampled upon. This is against the will of God." },
  { id: "p15", title: "Century of Light", author: "Universal House of Justice", text: "The elimination of all forms of injustice depends on the recognition of human oneness and the equality of all peoples." },
  { id: "p16", title: "Epistle to Son of Wolf", author: "Bahá'u'lláh", text: "The structure of world stability can be raised only on the foundation of justice and not on the foundation of reward and punishment." },
  { id: "p17", title: "Advent of Divine Justice", author: "Shoghi Effendi", text: "This rectitude of conduct must be consistently practised with friend and foe alike; justice must be upheld regardless of circumstances." },
  { id: "p18", title: "Will and Testament", author: "Abdu'l-Bahá", text: "The House of Justice must ever have before its eyes the justice of the Lord. It must weigh in the balance of equity." },
  { id: "p19", title: "Tablets of Divine Plan", author: "Abdu'l-Bahá", text: "The canopy of justice must be raised and the banner of equity unfurled throughout the world." },
  { id: "p20", title: "God Passes By", author: "Shoghi Effendi", text: "A new world order must be established where the ideals of justice prevail and the rights of all are protected." }
];

// Models to test
const MODELS = {
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
  'gpt-3.5-turbo': { provider: 'openai', model: 'gpt-3.5-turbo' },
  'gpt-4o': { provider: 'openai', model: 'gpt-4o' },
};

// Test configurations
const CONFIGS = [
  {
    name: 'gpt-3.5-turbo (10 passages)',
    planning: 'gpt-3.5-turbo',
    analysis: 'gpt-3.5-turbo',
    passages: 10
  },
  {
    name: 'gpt-3.5-turbo (20 passages)',
    planning: 'gpt-3.5-turbo',
    analysis: 'gpt-3.5-turbo',
    passages: 20
  },
  {
    name: 'gpt-4o-mini (10 passages)',
    planning: 'gpt-4o-mini',
    analysis: 'gpt-4o-mini',
    passages: 10
  },
  {
    name: 'gpt-4o-mini (20 passages)',
    planning: 'gpt-4o-mini',
    analysis: 'gpt-4o-mini',
    passages: 20
  },
  {
    name: 'SKIP PLANNING: gpt-3.5 analysis only (10 passages)',
    planning: null,
    analysis: 'gpt-3.5-turbo',
    passages: 10
  },
  {
    name: 'SKIP PLANNING: gpt-3.5 analysis only (20 passages)',
    planning: null,
    analysis: 'gpt-3.5-turbo',
    passages: 20
  },
  {
    name: 'MINIMAL: gpt-3.5 (5 passages)',
    planning: 'gpt-3.5-turbo',
    analysis: 'gpt-3.5-turbo',
    passages: 5
  }
];

// Simplified planning prompt
const PLANNING_PROMPT = `Create a search plan for: "${TEST_QUERY}"

Return JSON only:
{
  "type": "simple" | "exhaustive",
  "reasoning": "brief strategy",
  "queries": [
    { "query": "search string", "mode": "hybrid" | "keyword", "rationale": "why" }
  ]
}

Generate 3-5 search queries.`;

// Simplified analysis prompt for ALL passages at once
function getAnalysisPrompt(passages) {
  return `Analyze these passages for: "${TEST_QUERY}"

PASSAGES:
${passages.map((p, i) => `[${i}] ${p.title} by ${p.author}:\n${p.text}`).join('\n\n---\n\n')}

For each passage, provide:
1. Score (0-100)
2. Brief answer (5-8 words)
3. Key sentence start (first 4 words verbatim)
4. Key sentence end (last 4 words verbatim)
5. Core terms to highlight (3-5 words)

Return JSON:
{
  "results": [
    {
      "index": 0,
      "score": 85,
      "briefAnswer": "Justice is seeing with own eyes",
      "sentenceStart": "The best beloved of",
      "sentenceEnd": "confide in thee.",
      "coreTerms": ["Justice", "beloved", "eyes"]
    }
  ],
  "introduction": "Brief 1-sentence intro"
}`;
}

async function testModel(modelConfig, prompt, label) {
  const start = Date.now();
  try {
    const response = await ai.chat([
      { role: 'user', content: prompt }
    ], {
      model: modelConfig.model,
      temperature: 0.3,
      maxTokens: 1000
    });
    const duration = Date.now() - start;

    // Try to parse JSON to verify it worked
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const valid = jsonMatch ? 'valid' : 'invalid';

    return { duration, valid, tokens: response.usage?.totalTokens || 0 };
  } catch (err) {
    return { duration: Date.now() - start, valid: 'error', error: err.message };
  }
}

async function runBenchmark() {
  console.log('='.repeat(60));
  console.log('Search Performance Benchmark');
  console.log('='.repeat(60));
  console.log(`Query: "${TEST_QUERY}"`);
  console.log(`Available passages: ${TEST_PASSAGES.length + MORE_PASSAGES.length}`);
  console.log('');

  const allPassages = [...TEST_PASSAGES, ...MORE_PASSAGES];
  const results = [];

  // Test each configuration
  for (const config of CONFIGS) {
    console.log(`\n--- ${config.name} ---`);

    const passages = allPassages.slice(0, config.passages);
    let planDuration = 0;

    // Test planning (if configured)
    if (config.planning) {
      console.log('Planning...');
      const planResult = await testModel(
        MODELS[config.planning],
        PLANNING_PROMPT,
        'planning'
      );
      planDuration = planResult.duration;
      console.log(`  Planning: ${planResult.duration}ms (${planResult.valid}, ${planResult.tokens} tokens)`);
    } else {
      console.log('  Planning: SKIPPED');
    }

    // Test analysis
    console.log('Analysis...');
    const analysisResult = await testModel(
      MODELS[config.analysis],
      getAnalysisPrompt(passages),
      'analysis'
    );
    console.log(`  Analysis: ${analysisResult.duration}ms (${analysisResult.valid}, ${analysisResult.tokens} tokens)`);

    const total = planDuration + analysisResult.duration;
    console.log(`  TOTAL: ${total}ms`);

    results.push({
      name: config.name,
      planning: planDuration,
      analysis: analysisResult.duration,
      total,
      passages: config.passages
    });

    // Small delay between tests
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary table
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY (sorted by total time)');
  console.log('='.repeat(60));
  results.sort((a, b) => a.total - b.total);
  console.log('');
  console.log('Config'.padEnd(50) + 'Plan'.padStart(8) + 'Analysis'.padStart(10) + 'Total'.padStart(10));
  console.log('-'.repeat(78));
  for (const r of results) {
    const planStr = r.planning ? `${r.planning}ms` : 'skip';
    console.log(
      r.name.padEnd(50) +
      planStr.padStart(8) +
      `${r.analysis}ms`.padStart(10) +
      `${r.total}ms`.padStart(10)
    );
  }
  console.log('');
}

// Run
runBenchmark().catch(console.error);
