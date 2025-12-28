# API Services

Business logic and external service integrations.

## Files

### email.js
Email delivery abstraction supporting multiple providers:
- Console (development - logs to stdout)
- Resend (production email API)

Handles transactional emails for:
- Email verification
- Password reset
- Welcome messages
- Notification emails

### embeddings.js
Vector embedding generation for semantic search:
- Uses OpenAI's text-embedding-3-small model
- Batch embedding for efficiency
- Caching layer for repeated content

### indexer.js
Document indexing pipeline for Meilisearch:
- `indexDocumentFromText()` - Index single document
- `batchIndexDocuments()` - Bulk indexing
- `indexFromJSON()` - Index structured JSON
- `removeDocument()` - Delete from index
- `getIndexingStatus()` - Queue status

Handles:
- Text segmentation into paragraphs
- Metadata extraction
- Language detection
- Embedding generation
- Meilisearch document upsert

### scheduler.js
Background job scheduling:
- Cron-based task execution
- Job queue management
- Retry logic for failed jobs

### search.js
Search orchestration layer:
- Query preprocessing
- Multi-index search coordination
- Result aggregation and ranking
- Facet handling

### stripe.js
Stripe payment integration:
- Checkout session creation
- Webhook handling
- Subscription management
- Donation processing

### tts.js
Text-to-speech service:
- ElevenLabs API integration
- Voice selection
- Audio caching
- Pronunciation dictionary for sacred terms

### translator.js
Translation service:
- AI-powered translation
- Shoghi Effendi style for Baha'i texts
- RTL language support
- Translation caching

## Service Patterns

Services follow consistent patterns:

```javascript
// Singleton initialization
let client = null;
function getClient() {
  if (!client) {
    client = new ExternalClient(config);
  }
  return client;
}

// Async operations with error handling
export async function performAction(input) {
  try {
    const client = getClient();
    return await client.action(input);
  } catch (error) {
    logger.error({ error }, 'Service action failed');
    throw new ServiceError('Action failed', { cause: error });
  }
}
```

## External Dependencies

| Service | Provider | Environment Variable |
|---------|----------|---------------------|
| Email | Resend | RESEND_API_KEY |
| Embeddings | OpenAI | OPENAI_API_KEY |
| TTS | ElevenLabs | ELEVENLABS_API_KEY |
| Payments | Stripe | STRIPE_SECRET_KEY |
| AI Chat | Anthropic/OpenAI | ANTHROPIC_API_KEY, OPENAI_API_KEY |
