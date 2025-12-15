/**
 * Memory Agent
 *
 * Provides semantic memory for user conversations. Uses libsql/turso embeddings
 * to store and retrieve relevant context from previous interactions.
 *
 * Key features:
 * - Store conversation messages with embeddings
 * - Semantic search over past conversations
 * - Retrieve relevant context for new queries
 * - Support user ID unification (anonymous -> authenticated)
 *
 * Architecture:
 * - Embeddings stored in conversation_memories table
 * - Uses same embedding model as search (text-embedding-3-small)
 * - Cosine similarity for semantic search
 * - Memory is scoped per user (anonymous or authenticated)
 */

import { BaseAgent } from './base-agent.js';
import { query, queryOne } from '../lib/db.js';
import { aiService } from '../lib/ai-services.js';

export class MemoryAgent extends BaseAgent {
  constructor(options = {}) {
    super('memory', {
      service: options.service || 'fast',
      temperature: 0.3,
      maxTokens: 500,
      systemPrompt: `You are a memory curator for an interfaith spiritual library.
Your job is to analyze conversation content and extract key topics, questions, and interests.
Focus on spiritual concepts, religious references, and philosophical themes.
Be concise and precise in your extractions.`,
      ...options
    });

    // Similarity threshold for memory retrieval
    this.similarityThreshold = options.similarityThreshold || 0.75;
    this.maxMemories = options.maxMemories || 5;
  }

  /**
   * Store a message in memory with its embedding
   * @param {string} userId - Anonymous user ID or authenticated user ID
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - The message content
   * @param {object} metadata - Additional context (query, topics, etc.)
   */
  async storeMemory(userId, role, content, metadata = {}) {
    if (!userId || !content) {
      this.logger.warn({ userId, hasContent: !!content }, 'Cannot store memory: missing data');
      return null;
    }

    try {
      // Generate embedding for the content
      const embedding = await aiService('embedding').embed(content);

      // Extract key topics from the content
      const topics = await this.extractTopics(content);

      // Store in database
      const result = await query(
        `INSERT INTO conversation_memories
         (user_id, role, content, embedding, topics, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          userId,
          role,
          content.substring(0, 2000), // Limit content size
          JSON.stringify(embedding),
          JSON.stringify(topics),
          JSON.stringify(metadata)
        ]
      );

      this.logger.info({ userId, role, memoryId: result.lastInsertRowid }, 'Stored memory');
      return result.lastInsertRowid;
    } catch (err) {
      this.logger.error({ err, userId }, 'Failed to store memory');
      return null;
    }
  }

  /**
   * Search memories semantically
   * @param {string} userId - User ID to search for
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} Matching memories with similarity scores
   */
  async searchMemories(userId, searchQuery, limit = this.maxMemories) {
    if (!userId || !searchQuery) {
      return [];
    }

    try {
      // Generate embedding for search query
      const queryEmbedding = await aiService('embedding').embed(searchQuery);

      // Fetch all memories for this user (we'll compute similarity in JS)
      // In production with many memories, use vector index or pgvector
      const memories = await query(
        `SELECT id, role, content, embedding, topics, metadata, created_at
         FROM conversation_memories
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId]
      );

      if (!memories || memories.length === 0) {
        return [];
      }

      // Calculate cosine similarity for each memory
      const scored = memories.map(memory => {
        let embedding;
        try {
          embedding = JSON.parse(memory.embedding);
        } catch {
          return { ...memory, similarity: 0 };
        }

        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        return { ...memory, similarity };
      });

      // Filter by threshold and sort by similarity
      const relevant = scored
        .filter(m => m.similarity >= this.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      // Parse JSON fields
      return relevant.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        topics: this.safeParseJSON(m.topics, []),
        metadata: this.safeParseJSON(m.metadata, {}),
        similarity: m.similarity,
        createdAt: m.created_at
      }));
    } catch (err) {
      this.logger.error({ err, userId }, 'Failed to search memories');
      return [];
    }
  }

  /**
   * Get recent context for a user (last N messages)
   */
  async getRecentContext(userId, limit = 10) {
    if (!userId) return [];

    try {
      const memories = await query(
        `SELECT id, role, content, topics, created_at
         FROM conversation_memories
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, limit]
      );

      return memories.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        topics: this.safeParseJSON(m.topics, []),
        createdAt: m.created_at
      })).reverse(); // Chronological order
    } catch (err) {
      this.logger.error({ err, userId }, 'Failed to get recent context');
      return [];
    }
  }

  /**
   * Get user profile summary (interests, topics, preferences)
   */
  async getUserProfile(userId) {
    if (!userId) return null;

    try {
      // Get topic frequency from memories
      const memories = await query(
        `SELECT topics FROM conversation_memories WHERE user_id = ?`,
        [userId]
      );

      const topicCounts = {};
      for (const memory of memories) {
        const topics = this.safeParseJSON(memory.topics, []);
        for (const topic of topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }

      // Sort by frequency
      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count }));

      // Get anonymous user preferences if available
      const anonUser = await queryOne(
        `SELECT preferences, interests FROM anonymous_users WHERE id = ?`,
        [userId]
      );

      return {
        userId,
        memoryCount: memories.length,
        topTopics,
        preferences: this.safeParseJSON(anonUser?.preferences, {}),
        savedInterests: this.safeParseJSON(anonUser?.interests, [])
      };
    } catch (err) {
      this.logger.error({ err, userId }, 'Failed to get user profile');
      return null;
    }
  }

  /**
   * Unify memories when user logs in
   * Transfers all anonymous user memories to authenticated user
   */
  async unifyMemories(anonymousUserId, authenticatedUserId) {
    if (!anonymousUserId || !authenticatedUserId) {
      return false;
    }

    try {
      const result = await query(
        `UPDATE conversation_memories
         SET user_id = ?
         WHERE user_id = ?`,
        [authenticatedUserId, anonymousUserId]
      );

      this.logger.info({
        anonymousUserId,
        authenticatedUserId,
        memoriesTransferred: result.rowsAffected
      }, 'Unified user memories');

      return true;
    } catch (err) {
      this.logger.error({ err, anonymousUserId, authenticatedUserId }, 'Failed to unify memories');
      return false;
    }
  }

  /**
   * Extract key topics from content using AI
   */
  async extractTopics(content) {
    try {
      const response = await this.chat([
        {
          role: 'user',
          content: `Extract 3-5 key spiritual/philosophical topics from this text. Return only a JSON array of lowercase topic strings.

TEXT: "${content.substring(0, 500)}"

Topics:`
        }
      ], { maxTokens: 100 });

      return this.parseJSON(response.content);
    } catch {
      // Fallback: extract simple keywords
      const words = content.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 4)
        .slice(0, 5);
      return [...new Set(words)];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Safe JSON parse with fallback
   */
  safeParseJSON(str, fallback = null) {
    if (!str) return fallback;
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }
}

export default MemoryAgent;
