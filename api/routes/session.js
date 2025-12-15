/**
 * Session API Routes
 * Handles session initialization and conversation tracking
 */

import { aiService } from '../lib/ai-services.js';
import { logger } from '../lib/logger.js';

// Sifter's personality for generating introductions
const SIFTER_SYSTEM_PROMPT = `You are Sifter, a friendly and knowledgeable research assistant for SifterSearch, an interfaith library search system.

Your personality:
- Warm, welcoming, and genuinely eager to help
- Scholarly but approachable - you love sharing knowledge without being condescending
- Enthusiastic about interfaith studies and finding connections between traditions
- You speak naturally and conversationally, not stiffly

Your role:
- Help users search through a vast library of sacred texts, religious writings, and scholarly works
- You can search, summarize, compare across traditions, and explain complex concepts
- You're here to assist researchers, students, and curious minds exploring spirituality

Keep introductions brief (2-3 sentences max) and inviting.`;

export default async function sessionRoutes(fastify) {
  // Initialize or resume a session
  fastify.post('/init', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'isNew'],
        properties: {
          sessionId: { type: 'string', minLength: 1 },
          isNew: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    const { sessionId, isNew } = request.body;

    logger.info({ sessionId, isNew }, 'Session init');

    // For new sessions, generate a personalized intro from Sifter
    if (isNew) {
      try {
        const introResponse = await aiService('creative').chat([
          { role: 'system', content: SIFTER_SYSTEM_PROMPT },
          { role: 'user', content: 'A new user just opened SifterSearch for the first time. Give them a warm, brief welcome introducing yourself as Sifter and what you can help them do. Be friendly and inviting. Keep it to 2-3 sentences.' }
        ], {
          temperature: 0.9,
          maxTokens: 200
        });

        return {
          sessionId,
          isNew: true,
          intro: {
            role: 'assistant',
            content: introResponse.content,
            isIntro: true
          }
        };
      } catch (err) {
        logger.error({ err }, 'Failed to generate intro');
        // Fallback intro if AI fails
        return {
          sessionId,
          isNew: true,
          intro: {
            role: 'assistant',
            content: "Hello! I'm Sifter, your research assistant for exploring the interfaith library. I can help you search sacred texts, compare teachings across traditions, and discover insights from thousands of religious and philosophical works. What would you like to explore?",
            isIntro: true
          }
        };
      }
    }

    // Returning user - no intro needed
    return {
      sessionId,
      isNew: false,
      intro: null
    };
  });
}
