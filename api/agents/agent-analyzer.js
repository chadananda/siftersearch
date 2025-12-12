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
3. Find the MOST relevant sentence in each passage - provide anchor words to locate it
4. Identify 1-3 key words/phrases to highlight
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
      "sentenceStart": "first three words",
      "sentenceEnd": "last three words",
      "keyWords": ["word1", "phrase"],
      "summary": "Direct 5-10 word answer"
    }
  ],
  "introduction": "Brief 1 sentence intro"
}

PASSAGES:
${passagesForAnalysis.map((p, i) => `[${i}] ${p.title} by ${p.author}:\n${p.text}`).join('\n\n---\n\n')}

CRITICAL RULES:
- Only include relevant passages
- sentenceStart: the EXACT first 3-5 words of the relevant sentence (copy verbatim)
- sentenceEnd: the EXACT last 3-5 words of the relevant sentence (copy verbatim, including punctuation)
- keyWords: 1-3 important words/phrases from that sentence to bold
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
          keyWords: [],
          highlightedText: hit.text
        })),
        introduction: `Found ${hits.length} passages related to your query.`,
        query,
        error: 'Analysis unavailable'
      };
    }
  }

  /**
   * Normalize text for fuzzy matching - lowercase, collapse whitespace, remove punctuation
   */
  normalizeForMatch(str) {
    return str.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
  }

  /**
   * Find position in original text that matches normalized anchor
   */
  findAnchorPosition(text, anchor, searchFrom = 0) {
    const normalizedAnchor = this.normalizeForMatch(anchor);
    const anchorWords = normalizedAnchor.split(' ').filter(w => w.length > 0);
    if (anchorWords.length === 0) return -1;

    // Slide through the text looking for matching sequence of words
    const textLower = text.toLowerCase();
    let pos = searchFrom;

    while (pos < text.length) {
      // Find first word
      const firstWordPos = textLower.indexOf(anchorWords[0], pos);
      if (firstWordPos === -1) return -1;

      // Check if remaining words follow
      let matchStart = firstWordPos;
      let matchEnd = firstWordPos;
      let wordIdx = 0;
      let checkPos = firstWordPos;

      while (wordIdx < anchorWords.length && checkPos < text.length) {
        // Skip non-word characters
        while (checkPos < text.length && /[\s\W]/.test(text[checkPos])) {
          checkPos++;
        }

        // Extract word at current position
        let wordEnd = checkPos;
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
          wordEnd++;
        }

        const word = text.substring(checkPos, wordEnd).toLowerCase();

        if (word === anchorWords[wordIdx]) {
          if (wordIdx === 0) matchStart = checkPos;
          matchEnd = wordEnd;
          wordIdx++;
          checkPos = wordEnd;
        } else if (wordIdx === 0) {
          // First word didn't match, move on
          break;
        } else {
          // Partial match failed, restart search
          break;
        }
      }

      if (wordIdx === anchorWords.length) {
        // All words matched
        return { start: matchStart, end: matchEnd };
      }

      pos = firstWordPos + 1;
    }

    return -1;
  }

  /**
   * Find sentence in text using start and end anchors (fuzzy matching)
   */
  findSentenceByAnchors(text, startAnchor, endAnchor) {
    if (!startAnchor || !endAnchor) return null;

    // Find start anchor position
    const startMatch = this.findAnchorPosition(text, startAnchor, 0);
    if (startMatch === -1) return null;

    // Find end anchor position (must be after start)
    const endMatch = this.findAnchorPosition(text, endAnchor, startMatch.end);
    if (endMatch === -1) return null;

    // Sanity check: sentence shouldn't be too long (max 500 chars)
    if (endMatch.end - startMatch.start > 500) return null;

    return {
      start: startMatch.start,
      end: endMatch.end,
      text: text.substring(startMatch.start, endMatch.end)
    };
  }

  /**
   * Enhance results with highlighting
   */
  enhanceResults(analysisResults, originalHits) {
    return analysisResults.map(result => {
      const originalHit = originalHits[result.originalIndex];
      if (!originalHit) return null;

      const plainText = originalHit.text || '';
      let highlightedText = plainText;

      // Use anchor-based matching (new approach)
      if (result.sentenceStart && result.sentenceEnd) {
        const match = this.findSentenceByAnchors(plainText, result.sentenceStart, result.sentenceEnd);

        if (match) {
          let highlightedSentence = match.text;

          // Bold keywords within the sentence
          if (result.keyWords?.length > 0) {
            const sortedKeyWords = [...result.keyWords].sort((a, b) => b.length - a.length);
            for (const keyword of sortedKeyWords) {
              const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
              highlightedSentence = highlightedSentence.replace(regex, '<b>$1</b>');
            }
          }

          // Reconstruct with mark tag
          const before = plainText.substring(0, match.start);
          const after = plainText.substring(match.end);
          highlightedText = `${before}<mark>${highlightedSentence}</mark>${after}`;
        } else {
          // HIGHLIGHT FAILURE - log error for debugging
          this.logger.error({
            originalIndex: result.originalIndex,
            sentenceStart: result.sentenceStart,
            sentenceEnd: result.sentenceEnd,
            textPreview: plainText.substring(0, 200),
            title: originalHit.title
          }, 'HIGHLIGHT FAILED: Could not match anchors in text');
        }
      } else {
        // Missing anchors from LLM
        this.logger.error({
          originalIndex: result.originalIndex,
          hasSentenceStart: !!result.sentenceStart,
          hasSentenceEnd: !!result.sentenceEnd,
          title: originalHit.title
        }, 'HIGHLIGHT FAILED: LLM did not return sentence anchors');
      }

      return {
        id: originalHit.id,
        text: originalHit.text,
        title: originalHit.title,
        author: originalHit.author,
        religion: originalHit.religion,
        collection: originalHit.collection || originalHit.religion,
        summary: result.summary || '',
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
