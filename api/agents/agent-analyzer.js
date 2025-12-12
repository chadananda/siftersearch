/**
 * Analyzer Agent - Re-ranking and Summarization Specialist
 *
 * The Analyzer agent processes search results to:
 * - Re-rank by relevance to the user's query
 * - Filter out irrelevant results
 * - Identify the most relevant sentence in each hit
 * - Highlight key words/phrases
 * - Generate concise, direct summaries
 */

import { BaseAgent } from './base-agent.js';

const ANALYZER_SYSTEM_PROMPT = `You are an expert search result analyzer. Your job is to re-rank, filter, and annotate search results for maximum relevance.

CRITICAL SUMMARY RULES:
- Answer the query directly from the quote's content
- NO meta-language: Never say "this passage states", "asserts", "discusses", "addresses", "explores"
- Just give the answer. Example: "Unity through diversity" NOT "This passage asserts that unity comes through diversity"
- Maximum 10 words per summary
- If query is "What is X?" -> summary is "X is [answer]"
- If query is "How to Y?" -> summary is "[method]"

ANALYSIS TASKS:
1. Re-rank passages by relevance (most relevant first)
2. Remove passages that don't help answer the query
3. Find the MOST relevant sentence in each passage
4. Identify 1-3 key words/phrases in that sentence
5. Write a DIRECT answer summary (5-10 words)

Return only valid JSON, no markdown.`;

export class AnalyzerAgent extends BaseAgent {
  constructor(options = {}) {
    super('analyzer', {
      model: options.model || 'gpt-4o',
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens || 3000,
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      ...options
    });
  }

  /**
   * Analyze and re-rank search results
   */
  async analyze(query, searchResults, _options = {}) {
    const hits = searchResults.hits || searchResults;

    if (!hits || hits.length === 0) {
      return {
        results: [],
        introduction: 'No relevant passages found.',
        query
      };
    }

    // Prepare passages for analysis
    const passagesForAnalysis = hits.map((hit, i) => ({
      index: i,
      text: hit.text || hit._formatted?.text || '',
      title: hit.title || 'Untitled',
      author: hit.author || 'Unknown',
      religion: hit.religion || '',
      collection: hit.collection || ''
    }));

    const analyzerPrompt = `Analyze search results for: "${query}"

TASKS:
1. Re-rank by relevance (most relevant first)
2. Remove irrelevant passages
3. Find the MOST relevant sentence in each passage
4. Identify 1-3 key words/phrases in that sentence
5. Write a DIRECT answer summary (5-10 words max)

CRITICAL SUMMARY RULES:
- Answer the query directly from the quote's content
- NO meta-language: Never say "this passage states", "asserts", "discusses", "addresses"
- Format: Just the answer. Example: "Unity through diversity of traditions" NOT "This passage asserts that unity comes through diversity"
- If query is "What is X?" -> summary is "X is [answer]"
- If query is "How to Y?" -> summary is "[method/answer]"
- Maximum 10 words

Return ONLY valid JSON:
{
  "results": [
    {
      "originalIndex": 0,
      "relevantSentence": "Exact quote from passage",
      "keyWords": ["word1", "phrase"],
      "summary": "Direct 5-10 word answer"
    }
  ],
  "introduction": "Brief 1 sentence intro"
}

PASSAGES:
${passagesForAnalysis.map((p, i) => `[${i}] ${p.title} by ${p.author}:\n${p.text}`).join('\n\n---\n\n')}

Rules:
- Only include relevant passages
- relevantSentence must be EXACT quote
- keyWords from relevantSentence only
- Summaries: direct answers, no filler words`;

    try {
      const response = await this.chat([
        { role: 'user', content: analyzerPrompt }
      ]);

      const analysis = this.parseJSON(response.content);

      // Enhance results with highlighting
      const enhancedResults = this.enhanceResults(analysis.results, hits);

      return {
        results: enhancedResults,
        introduction: analysis.introduction || `Found ${enhancedResults.length} relevant passages.`,
        query,
        originalCount: hits.length,
        filteredCount: enhancedResults.length
      };

    } catch (error) {
      this.logger.error({ error, query }, 'Analysis failed');

      // Return original results as fallback
      return {
        results: hits.map(hit => ({
          ...hit,
          summary: '',
          relevantSentence: '',
          highlightedText: hit.text // Plain text in fallback, no highlighting
        })),
        introduction: `Found ${hits.length} passages related to your query.`,
        query,
        error: 'Analysis unavailable'
      };
    }
  }

  /**
   * Enhance results with highlighting
   */
  enhanceResults(analysisResults, originalHits) {
    return analysisResults.map(result => {
      const originalHit = originalHits[result.originalIndex];
      if (!originalHit) return null;

      // Create highlighted text - start with plain text, not Meilisearch's formatted version
      let highlightedText = originalHit.text || '';
      const plainText = highlightedText;

      if (result.relevantSentence) {
        // Try to find where the sentence appears in the plain text
        // First try exact match
        let sentenceIndex = plainText.indexOf(result.relevantSentence);
        let matchedSentence = result.relevantSentence;

        // If exact match fails, try normalized matching
        if (sentenceIndex === -1) {
          const normalizedSentence = result.relevantSentence.replace(/\s+/g, ' ').trim();
          const normalizedText = plainText.replace(/\s+/g, ' ');
          const normalizedIndex = normalizedText.indexOf(normalizedSentence);

          if (normalizedIndex !== -1) {
            // Approximate position mapping
            let charCount = 0;
            let actualIndex = 0;
            for (let i = 0; i < plainText.length && charCount < normalizedIndex; i++) {
              if (!/\s/.test(plainText[i]) || (i > 0 && !/\s/.test(plainText[i-1]))) {
                charCount++;
              }
              actualIndex = i;
            }
            let sentenceEnd = actualIndex;
            let matchedChars = 0;
            const targetChars = normalizedSentence.replace(/\s+/g, '').length;
            for (let i = actualIndex; i < plainText.length && matchedChars < targetChars; i++) {
              if (!/\s/.test(plainText[i])) {
                matchedChars++;
              }
              sentenceEnd = i + 1;
            }
            sentenceIndex = actualIndex;
            matchedSentence = plainText.substring(actualIndex, sentenceEnd);
          }
        }

        // If still no match, try finding the first few words
        if (sentenceIndex === -1) {
          const words = result.relevantSentence.split(/\s+/).slice(0, 5).join(' ');
          if (words.length > 10) {
            const partialIndex = plainText.indexOf(words);
            if (partialIndex !== -1) {
              const sentenceEndMatch = plainText.substring(partialIndex).match(/[.!?]/);
              const sentenceEnd = sentenceEndMatch
                ? partialIndex + sentenceEndMatch.index + 1
                : Math.min(partialIndex + result.relevantSentence.length + 50, plainText.length);
              sentenceIndex = partialIndex;
              matchedSentence = plainText.substring(partialIndex, sentenceEnd).trim();
            }
          }
        }

        if (sentenceIndex !== -1) {
          let highlightedSentence = matchedSentence;

          // If we have keywords, bold them within the sentence
          if (result.keyWords?.length > 0) {
            const sortedKeyWords = [...result.keyWords].sort((a, b) => b.length - a.length);
            for (const keyword of sortedKeyWords) {
              const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
              highlightedSentence = highlightedSentence.replace(regex, '<b>$1</b>');
            }
          }

          // Reconstruct with mark tag
          const before = plainText.substring(0, sentenceIndex);
          const after = plainText.substring(sentenceIndex + matchedSentence.length);
          highlightedText = `${before}<mark>${highlightedSentence}</mark>${after}`;
        }
      }

      return {
        id: originalHit.id,
        text: originalHit.text, // Plain text without Meilisearch highlighting
        title: originalHit.title,
        author: originalHit.author,
        religion: originalHit.religion,
        collection: originalHit.collection || originalHit.religion,
        summary: result.summary || '',
        relevantSentence: result.relevantSentence || '',
        keyWords: result.keyWords || [],
        highlightedText // Only this has <mark> around the relevant sentence
      };
    }).filter(Boolean);
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Quick relevance check without full analysis
   */
  async checkRelevance(query, passage) {
    const prompt = `Is this passage relevant to the query "${query}"?

Passage: "${passage.substring(0, 500)}"

Reply with JSON only: { "relevant": true/false, "reason": "brief reason" }`;

    try {
      const response = await this.chat([
        { role: 'user', content: prompt }
      ], { temperature: 0.1, maxTokens: 100 });

      return this.parseJSON(response.content);
    } catch {
      return { relevant: true, reason: 'Unknown' };
    }
  }

  /**
   * Generate a synthesis of multiple passages
   */
  async synthesize(query, passages) {
    if (passages.length === 0) {
      return { synthesis: 'No passages to synthesize.' };
    }

    const synthesisPrompt = `Based on these ${passages.length} passages answering "${query}", write a brief synthesis (2-3 sentences) that captures the key themes.

Passages:
${passages.map((p, i) => `[${i + 1}] ${p.text?.substring(0, 300)}...`).join('\n\n')}

Be concise and cite passage numbers [1], [2], etc.`;

    const response = await this.chat([
      { role: 'user', content: synthesisPrompt }
    ], { temperature: 0.5, maxTokens: 300 });

    return {
      synthesis: response.content,
      passageCount: passages.length
    };
  }
}

export default AnalyzerAgent;
