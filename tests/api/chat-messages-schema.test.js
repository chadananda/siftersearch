// Chat body schema: the reader's message is bounded; Anís's own long replies, sent back as history, never 400 the next turn.
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { chatMessagesSchema, USER_MAX } from '../../api/lib/chat-messages-schema.js';

const valid = new Ajv().compile(chatMessagesSchema());
const long = 'x'.repeat(USER_MAX + 1);

describe('chat messages schema', () => {
  it('a long assistant reply in the history passes (11-11: messages/3 over 4000 chars → "Something went wrong")', () => {
    expect(valid([{ role: 'user', content: 'q' }, { role: 'assistant', content: long }, { role: 'user', content: 'and?' }])).toBe(true);
  });
  it('a reader message over the limit is still refused', () => {
    expect(valid([{ role: 'user', content: long }])).toBe(false);
  });
});
