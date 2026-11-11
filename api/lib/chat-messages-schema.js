// Chat `messages` body schema (site /stream + public /chat). The reader's message is bounded; Anís's own replies come back as
// history and are never truncated, so a long reply must not 400 the next turn (11-11: "Something went wrong reaching the assistant").
export const USER_MAX = 4000, ASSISTANT_MAX = 60000;
export const chatMessagesSchema = (extra = {}) => ({
  type: 'array', minItems: 1, maxItems: 50, ...extra,
  items: {
    type: 'object', required: ['role', 'content'],
    properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string', maxLength: ASSISTANT_MAX } },
    if: { properties: { role: { const: 'user' } } },
    then: { properties: { content: { type: 'string', maxLength: USER_MAX } } }
  }
});
