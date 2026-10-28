// Chad 10-28: no book is imported without his yes - the daily pulse offers, it never auto-adds.
import { describe, it, expect } from 'vitest';
import { BOOKS_NEED_APPROVAL } from '../../api/lib/dewey/scout/scout.js';
describe('books need approval', () => { it('the pulse is not allowed to auto-add books', () => { expect(BOOKS_NEED_APPROVAL).toBe(true); }); });
