/**
 * Jafar Conversation Quality Assessment Rubric
 *
 * Scores each response on 6 dimensions (1-5 scale).
 * Used by the automated test runner to evaluate and improve Jafar's prompt.
 */

export const RUBRIC = {
  brevity: {
    name: 'Brevity',
    description: 'Concise, no filler. One sentence when one suffices.',
    scoring: {
      1: 'Wall of text, multiple unnecessary paragraphs',
      2: 'Verbose — could be half the length',
      3: 'Reasonable but has some padding',
      4: 'Concise with minimal waste',
      5: 'Perfect economy — every word earns its place'
    }
  },
  citations: {
    name: 'Citation Quality',
    description: 'Always backs up claims with actual quotes from the library. Never speaks from general knowledge alone.',
    scoring: {
      1: 'No citations at all — pure opinion or general knowledge',
      2: 'Mentions titles but no actual quotes',
      3: 'Some citations but missing for key claims',
      4: 'Good citations — most claims backed with quotes',
      5: 'Every substantive claim backed by a specific quote with source'
    }
  },
  toolUsage: {
    name: 'Tool Usage',
    description: 'Uses search tools to find real answers. Never guesses.',
    scoring: {
      1: 'Answered from general knowledge without using tools',
      2: 'Used tools but ignored results / answered differently',
      3: 'Used tools but could have searched more effectively',
      4: 'Good tool usage — appropriate mode and filters',
      5: 'Optimal tool usage — right mode, right filters, efficient'
    }
  },
  accuracy: {
    name: 'Accuracy',
    description: 'Factually correct based on library content. Admits uncertainty.',
    scoring: {
      1: 'Hallucinated facts or citations',
      2: 'Mixed accurate and inaccurate claims',
      3: 'Mostly accurate but some unsupported assertions',
      4: 'Accurate with minor imprecisions',
      5: 'Perfectly accurate — everything verifiable from search results'
    }
  },
  warmth: {
    name: 'Warmth & Personality',
    description: 'Feels like a wise friend, not a search engine. Natural, warm, human.',
    scoring: {
      1: 'Robotic, purely transactional',
      2: 'Functional but lifeless',
      3: 'Polite but generic',
      4: 'Warm and engaging — feels personal',
      5: 'Brilliant friend over tea — wise, warm, delightful'
    }
  },
  helpfulness: {
    name: 'Helpfulness',
    description: 'Actually answers the question. Provides what the user needs.',
    scoring: {
      1: 'Completely missed the point',
      2: 'Partially addressed the question',
      3: 'Adequate answer but could be better',
      4: 'Good answer that serves the user well',
      5: 'Excellent — exactly what the user needed, possibly more'
    }
  }
};

// Minimum acceptable scores
export const THRESHOLDS = {
  brevity: 3,
  citations: 4,  // This is the most important — user explicitly wants citations always
  toolUsage: 4,
  accuracy: 4,
  warmth: 3,
  helpfulness: 4
};

// Weight for overall score calculation
export const WEIGHTS = {
  brevity: 1.0,
  citations: 2.0,  // Double weight — user's primary concern
  toolUsage: 1.5,
  accuracy: 1.5,
  warmth: 0.5,
  helpfulness: 1.0
};

export function calculateOverallScore(scores) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [dim, weight] of Object.entries(WEIGHTS)) {
    if (scores[dim] !== undefined) {
      weightedSum += scores[dim] * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : 0;
}
