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
          highlightedText: hit._formatted?.text || hit.text
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

      // Create highlighted text
      let highlightedText = originalHit._formatted?.text || originalHit.text || '';

      if (result.relevantSentence && result.keyWords?.length > 0) {
        let highlightedSentence = result.relevantSentence;

        // Sort key words by length (longest first) to avoid partial replacements
        const sortedKeyWords = [...result.keyWords].sort((a, b) => b.length - a.length);

        for (const keyword of sortedKeyWords) {
          // Case-insensitive replacement with bold tags
          const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
          highlightedSentence = highlightedSentence.replace(regex, '<strong>$1</strong>');
        }

        // Replace the original sentence with highlighted version
        highlightedText = highlightedText.replace(
          result.relevantSentence,
          `<mark>${highlightedSentence}</mark>`
        );
      }

      return {
        id: originalHit.id,
        text: originalHit._formatted?.text || originalHit.text,
        title: originalHit.title,
        author: originalHit.author,
        religion: originalHit.religion,
        collection: originalHit.collection || originalHit.religion,
        summary: result.summary || '',
        relevantSentence: result.relevantSentence || '',
        keyWords: result.keyWords || [],
        highlightedText
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
