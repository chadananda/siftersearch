// vocab-repo — paragraph text paged by id for the vocabulary build (ops job vocab-build → search/spell.js). Each page its
// own short read (never one long transaction over the whole table). Read-only. Deps: db.js.
import { queryAll } from '../db.js';

export const textPage = (afterId, limit = 5000) =>
  queryAll('SELECT id, text FROM content WHERE id > ? AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0 ORDER BY id LIMIT ?',
    [Number(afterId) || 0, Number(limit)], 'vocab:page');
