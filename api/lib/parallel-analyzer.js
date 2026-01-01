/**
 * Parallel Passage Analyzer
 *
 * Analyzes search results in parallel batches for faster response times.
 * Instead of sending 20 passages to a single LLM call (slow),
 * we split into 10 parallel calls of 2 passages each.
 *
 * OPTIMIZATION: Uses extracted excerpts (sentences containing matches) instead
 * of full paragraphs. This reduces token usage by ~80% and speeds up analysis.
 * Sentence anchors are computed directly from Meilisearch match positions.
 *
 * Performance: ~2-3s instead of ~15-20s for 20 passages
 */

import { aiService } from './ai-services.js';
import { logger } from './logger.js';
import { enrichHitsWithExcerpts } from './search.js';

// Configuration
const BATCH_SIZE = 2; // Passages per parallel request
const MAX_CONCURRENT = 10; // Max parallel requests

/**
 * Strip Meilisearch's word-level <mark>/<em> tags from text
 * We use our own AI-driven phrase highlighting instead
 */
function stripMeiliHighlights(text) {
  if (!text) return text;
  return text
    .replace(/<\/?mark>/gi, '')
    .replace(/<\/?em>/gi, '');
}

/**
 * Normalize text for AI prompt - remove markdown formatting that confuses matching
 * Keeps the content readable but strips elements that cause keyPhrase mismatch
 */
function normalizeForAI(text) {
  if (!text) return text;
  return text
    // Remove blockquote markers
    .replace(/^>\s*/gm, '')
    // Remove emphasis markers (but keep content)
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Normalize quotes to standard double quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text at word boundary to avoid cutting mid-word
 */
function truncateAtWord(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return truncated.slice(0, lastSpace);
  }
  return truncated;
}

/**
 * Analyze a small batch of passages (typically 2)
 * Uses excerpts (extracted sentences) instead of full paragraphs for efficiency.
 * Returns scored and annotated results.
 */
async function analyzeBatch(query, passages, batchIndex, researchContext = '') {
  // Use excerpt if available, otherwise fall back to full text (truncated)
  // Normalize text to remove markdown that could confuse keyPhrase matching
  const batchPrompt = `User's question: "${query}"

${passages.map((p, i) => {
  const text = normalizeForAI(p.excerpt || truncateAtWord(p.text, 400));
  return `[${p.globalIndex}] ${p.title} by ${p.author}:
"${text}"`;
}).join('\n\n')}

TASK: For each passage, evaluate how directly it ANSWERS the user's question.

Even when the user's input is a topic or statement (not a question), treat it as an implied question:
- "justice" → "What is justice?" or "What do the texts say about justice?"
- "love and marriage" → "What is the relationship between love and marriage?"
- "meditation practices" → "What are meditation practices?" or "How should one meditate?"

CRITICAL - Keyword matches are NOT enough:
- A passage containing "meditation" but discussing organizational planning scores <30
- A passage must address the ACTUAL TOPIC, not just contain the keyword
- Ask yourself: "Does this passage help answer the question?" If no, score <50

Return JSON with:
- score: 0-100 based on how DIRECTLY the passage answers the question
  * 90-100: Contains a clear, direct answer (definitions, explanations, instructions)
  * 70-89: Substantially addresses the question with relevant insight
  * 50-69: Related to the topic but doesn't directly answer
  * <50: OFF-TOPIC - merely mentions keyword in unrelated context, or doesn't address the question
- summary: 8-15 words describing WHAT THE PASSAGE ACTUALLY SAYS - be faithful to the text!
  CRITICAL RULES:
  1. NEVER fabricate claims the passage doesn't make
  2. If the passage discusses X, say it discusses X - don't claim it "answers" something it doesn't
  3. Start with the main point, NEVER with "Addresses...", "Discusses...", "This passage..."
  EXAMPLES:
  - Passage about prayer's purpose → "Prayer is conversation with God"
  - Passage about letters in 'Báb' having mystical meaning → "The three letters of 'Báb' symbolize stages of divine Action"
  - Passage mentioning justice but focused on something else → score <50, or summary reflects actual topic
  BAD: Claiming a passage "answers" or "explains" something it merely mentions
- keyPhrase: CRITICAL - copy VERBATIM from the quoted text (5-15 words). Pick the most meaningful phrase.
- coreTerms: 1-3 key words to bold (copy exactly)

OUTPUT FORMAT (do not copy example values - analyze the actual passages):
{"results":[{"globalIndex":N,"score":N,"summary":"YOUR_ANALYSIS","keyPhrase":"COPY_FROM_TEXT","coreTerms":["term1"]}]}`;

  try {
    // Use 'fast' service for quick analysis
    const response = await aiService('fast').chat([
      { role: 'system', content: 'You are a scholarly research assistant. Your job is to identify which passages actually ANSWER the user\'s question. CRITICAL: The summary must FAITHFULLY represent what the passage actually says - never fabricate claims or connections the passage doesn\'t make. If a passage mentions a keyword but discusses something else, say what it actually discusses and score it low. Return only valid JSON. CRITICAL: keyPhrase MUST be copied character-for-character from the passage text.' },
      { role: 'user', content: batchPrompt }
    ], {
      temperature: 0.1,  // Lower temperature for more precise copying
      maxTokens: 600
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.results || [];
    }
    return [];
  } catch (err) {
    logger.warn({ err, batchIndex, passageCount: passages.length }, 'Batch analysis failed');
    // Return passages with default scores on failure
    return passages.map(p => ({
      globalIndex: p.globalIndex,
      score: 50,
      summary: '',
      briefAnswer: '', // Keep for backwards compatibility
      keyPhrase: '',
      coreTerms: []
    }));
  }
}

/**
 * Generate introduction text based on analyzed results.
 * Synthesizes key insights from top results into a brief answer.
 */
async function generateIntroduction(query, topResults, semanticNote = '') {
  const count = topResults.length;
  const traditions = [...new Set(topResults.map(r => r.religion).filter(Boolean))];

  // If we have good summaries from analysis, use AI to synthesize them
  const summaries = topResults
    .filter(r => r.summary || r.briefAnswer)
    .slice(0, 5)
    .map(r => r.summary || r.briefAnswer);

  if (summaries.length >= 2) {
    try {
      const response = await aiService('fast').chat([
        { role: 'system', content: 'You synthesize search results into a brief, scholarly answer. Be concise and direct. Write 1-2 sentences maximum.' },
        { role: 'user', content: `User asked: "${query}"

Top passages say:
${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Write a 1-2 sentence synthesis that answers the user's question based on these passages. Start directly with the answer, not "Based on..." or "The passages suggest...". Example: "Justice, according to these texts, is the fair treatment of all people according to divine principles."` }
      ], {
        temperature: 0.3,
        maxTokens: 100
      });

      if (response.content) {
        const traditionsNote = traditions.length > 1
          ? ` (${count} passages from ${traditions.slice(0, 3).join(', ')}${traditions.length > 3 ? ' and others' : ''})`
          : ` (${count} passages)`;
        return response.content.trim() + traditionsNote;
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to generate synthesized introduction');
    }
  }

  // Fallback to simple template
  if (traditions.length > 1) {
    return `Found ${count} passages across ${traditions.slice(0, 3).join(', ')}${traditions.length > 3 ? ' and others' : ''}.`;
  }
  return `Found ${count} relevant passages.`;
}

/**
 * Detect if results show semantic variations in key terms
 */
function detectSemanticVariations(results) {
  // Simple heuristic: if summaries vary significantly, note it
  const answers = results.filter(r => r.summary || r.briefAnswer).map(r => (r.summary || r.briefAnswer).toLowerCase());
  if (answers.length < 3) return null;

  // Check for contrasting concepts
  const concepts = {
    divine: answers.some(a => /divine|god|spiritual|sacred/.test(a)),
    social: answers.some(a => /social|society|community|human/.test(a)),
    personal: answers.some(a => /personal|individual|self|inner/.test(a)),
    practical: answers.some(a => /practical|action|do|practice/.test(a))
  };

  const conceptCount = Object.values(concepts).filter(Boolean).length;
  if (conceptCount >= 2) {
    const found = Object.entries(concepts).filter(([, v]) => v).map(([k]) => k);
    return `These passages explore the topic from ${found.join(' and ')} perspectives.`;
  }
  return null;
}

/**
 * Main parallel analysis function
 *
 * @param {string} query - User's search query
 * @param {Array} passages - Array of passage objects with id, text, title, author, etc.
 *                          Should include _matchesPosition from Meilisearch for excerpt extraction
 * @param {Object} options - Analysis options
 * @param {string} options.researchContext - Brief context about search strategy
 * @param {number} options.batchSize - Passages per batch (default: 2)
 * @param {number} options.maxConcurrent - Max parallel requests (default: 10)
 * @param {boolean} options.useExcerpts - Extract sentences containing matches (default: true)
 * @returns {Object} { results, introduction, semanticNote, timing }
 */
export async function analyzePassagesParallel(query, passages, options = {}) {
  const {
    researchContext = '',
    batchSize = BATCH_SIZE,
    maxConcurrent = MAX_CONCURRENT,
    useExcerpts = true
  } = options;

  const startTime = Date.now();

  // Enrich passages with excerpts (sentences containing matches)
  // This dramatically reduces token usage by sending only relevant sentences to AI
  let enrichedPassages = passages;
  if (useExcerpts) {
    enrichedPassages = enrichHitsWithExcerpts(passages, {
      contextSentences: 1,  // Include 1 sentence before/after match
      maxLength: 400        // Cap excerpt at 400 chars
    });
  }

  // Add global index to each passage for tracking
  const indexedPassages = enrichedPassages.map((p, i) => ({ ...p, globalIndex: i }));

  // Split into batches
  const batches = [];
  for (let i = 0; i < indexedPassages.length; i += batchSize) {
    batches.push(indexedPassages.slice(i, i + batchSize));
  }

  logger.info({
    query: query.substring(0, 50),
    totalPassages: passages.length,
    batchCount: batches.length,
    batchSize
  }, 'Starting parallel analysis');

  // Process batches in parallel (with concurrency limit)
  const allResults = [];
  for (let i = 0; i < batches.length; i += maxConcurrent) {
    const batchGroup = batches.slice(i, i + maxConcurrent);
    const batchPromises = batchGroup.map((batch, idx) =>
      analyzeBatch(query, batch, i + idx, researchContext)
    );

    const groupResults = await Promise.all(batchPromises);
    allResults.push(...groupResults.flat());
  }

  const analysisTimeMs = Date.now() - startTime;

  // Apply authority boost to scores before sorting
  // Authority (1-10) affects final ranking: high authority sources get boosted
  // Formula: boostedScore = rawScore * (1 + (authority - 5) * 0.10)
  // - Authority 10 = +50% boost (sacred texts, authoritative)
  // - Authority 9 = +40% boost (high authority)
  // - Authority 5 = no change (baseline)
  // - Authority 1 = -40% reduction (unofficial sources)
  for (const result of allResults) {
    const passage = passages[result.globalIndex];
    const authority = passage?.authority || 5;
    const rawScore = result.score || 0;
    const boostFactor = 1 + (authority - 5) * 0.10;
    result.rawScore = rawScore;
    result.authority = authority;
    result.score = Math.round(rawScore * boostFactor);
  }

  // Sort by boosted score (highest first)
  allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Filter to relevant results (score >= 40 after boost)
  // Lower threshold to include more marginally relevant passages
  const relevantResults = allResults.filter(r => (r.score || 0) >= 40);

  // Enrich results with original passage data
  // Use enrichedPassages to get excerpt from sentence extraction
  const enrichedResults = relevantResults.map(result => {
    const original = passages[result.globalIndex];
    const enriched = enrichedPassages[result.globalIndex];
    if (!original) return null;

    // Build highlighted text: use AI's keyPhrase for <mark>, coreTerms for <b>
    // We create both excerpt (for cards) and full text (for reader) versions
    // Strip any Meilisearch marks first - we apply our own AI-driven highlights
    const excerptText = stripMeiliHighlights(enriched?.excerpt || original.text);
    const fullText = stripMeiliHighlights(original.text);

    let highlightedExcerpt = excerptText;
    let highlightedFullText = fullText;
    let hasHighlight = false;

    // Helper to apply keyPhrase highlighting to a text
    function applyKeyPhraseHighlight(text, phraseWords) {
      let highlighted = text;
      let success = false;

      // Try progressively longer prefixes until we get a unique match
      for (let numWords = 1; numWords <= phraseWords.length && !success; numWords++) {
        const wordPatterns = phraseWords.slice(0, numWords)
          .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const flexiblePattern = wordPatterns.join('[\\s>_*"\'\\[\\]\\-.,;:!?\\n]*');

        try {
          const flexibleRegex = new RegExp(flexiblePattern, 'gi');
          const matches = highlighted.match(flexibleRegex);

          if (matches && matches.length === 1) {
            const fullPattern = phraseWords
              .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('[\\s>_*"\'\\[\\]\\-.,;:!?\\n]*');
            const fullRegex = new RegExp(`(${fullPattern})`, 'gi');
            const before = highlighted;
            highlighted = highlighted.replace(fullRegex, '<mark>$1</mark>');
            success = highlighted !== before;
            break;
          }
        } catch (regexErr) {
          continue;
        }
      }

      // Fallback 1: try significant words in sequence
      if (!success && phraseWords.length >= 2) {
        const significantWords = phraseWords.filter(w => w.length > 2).slice(0, 4);
        if (significantWords.length >= 2) {
          const simplePattern = significantWords
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^.!?\\n]*?');
          try {
            const simpleRegex = new RegExp(`(${simplePattern})`, 'gi');
            const before = highlighted;
            highlighted = highlighted.replace(simpleRegex, '<mark>$1</mark>');
            success = highlighted !== before;
          } catch (e) {
            // Skip on regex error
          }
        }
      }

      // Fallback 2: try finding any 3+ consecutive words from the phrase
      if (!success && phraseWords.length >= 3) {
        for (let start = 0; start <= phraseWords.length - 3 && !success; start++) {
          const threeWords = phraseWords.slice(start, start + 3)
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[\\s\\-.,;:!?\'"]*');
          try {
            const regex = new RegExp(`(${threeWords})`, 'gi');
            const before = highlighted;
            highlighted = highlighted.replace(regex, '<mark>$1</mark>');
            success = highlighted !== before;
          } catch (e) {
            continue;
          }
        }
      }

      return { text: highlighted, success };
    }

    // Apply keyPhrase highlighting to both excerpt and full text
    if (result.keyPhrase) {
      const phraseWords = result.keyPhrase.split(/\s+/).filter(w => w.length > 0);

      const excerptResult = applyKeyPhraseHighlight(highlightedExcerpt, phraseWords);
      highlightedExcerpt = excerptResult.text;
      hasHighlight = excerptResult.success;

      const fullResult = applyKeyPhraseHighlight(highlightedFullText, phraseWords);
      highlightedFullText = fullResult.text;

      if (!hasHighlight && !fullResult.success) {
        logger.debug({
          globalIndex: result.globalIndex,
          keyPhrase: result.keyPhrase?.substring(0, 50)
        }, 'keyPhrase match failed');
      }
    }

    // Bold the core terms (word-level emphasis) in both versions
    if (result.coreTerms?.length > 0) {
      const sortedTerms = [...result.coreTerms].sort((a, b) => b.length - a.length);
      for (const term of sortedTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const termRegex = new RegExp(`(?<!<[^>]*)\\b(${escaped})\\b(?![^<]*>)`, 'gi');
        highlightedExcerpt = highlightedExcerpt.replace(termRegex, '<b>$1</b>');
        highlightedFullText = highlightedFullText.replace(termRegex, '<b>$1</b>');
      }
    }

    return {
      ...result,
      id: original.id,
      text: stripMeiliHighlights(original.text),
      title: original.title,
      author: original.author,
      religion: original.religion,
      collection: original.collection,
      highlightedText: highlightedExcerpt,  // For cards (excerpt view)
      highlightedFullText,                   // For reader (full paragraph)
      excerpt: stripMeiliHighlights(enriched?.excerpt || original.text)
    };
  }).filter(Boolean);

  // Detect semantic variations
  const semanticNote = detectSemanticVariations(enrichedResults);

  // Generate introduction (can run in parallel with final processing)
  const introStartTime = Date.now();
  const introduction = await generateIntroduction(query, enrichedResults, semanticNote);
  const introTimeMs = Date.now() - introStartTime;

  const totalTimeMs = Date.now() - startTime;

  logger.info({
    query: query.substring(0, 50),
    inputPassages: passages.length,
    outputResults: enrichedResults.length,
    analysisTimeMs,
    introTimeMs,
    totalTimeMs
  }, 'Parallel analysis complete');

  return {
    results: enrichedResults,
    introduction,
    semanticNote,
    timing: {
      analysisTimeMs,
      introTimeMs,
      totalTimeMs,
      batchCount: batches.length,
      parallelBatches: Math.min(batches.length, maxConcurrent)
    }
  };
}

/**
 * Determine optimal passage count based on query complexity
 */
export function getOptimalPassageCount(query, planType = 'simple') {
  // Exhaustive queries (user explicitly wants comprehensive results)
  if (planType === 'exhaustive') {
    return { toAnalyze: 25, toReturn: 15 };
  }

  // Comparative queries (cross-tradition)
  if (planType === 'comparative') {
    return { toAnalyze: 18, toReturn: 12 };
  }

  // Default: analyze more passages for better coverage
  // With parallel processing, 15 passages is still fast (~2-3s)
  return { toAnalyze: 15, toReturn: 10 };
}

export default { analyzePassagesParallel, getOptimalPassageCount };
