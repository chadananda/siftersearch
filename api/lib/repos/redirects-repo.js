// redirects-repo — the reader's old→new path redirects (redirects table: slug and language renames), read by the Anís link
// routing (library/path-docs.js). Deps: db.js.
import { queryOne } from '../db.js';

/** A reader path's current path ('/library/<religion>/<collection>/<slug>') | null (no redirect recorded). old_path is unique. */
export const redirectTarget = async (oldPath) => (await queryOne('SELECT new_path FROM redirects WHERE old_path = ?', [oldPath], 'redirects-repo:target'))?.new_path || null;
