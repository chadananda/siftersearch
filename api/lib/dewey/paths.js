// Files Dewey may read IN PLACE on the server — a folder of the synced Dropbox (Chad 10-17: "check this set of books"; later
// "spider many hard drives"). No upload, no size limit (a 280 MB scan cannot cross the tunnel's ~100 MB body cap), and the
// original stays where it lives. Only under DEWEY_PATH_ROOTS (':'-separated; default the Ocean2.0 Supplemental folder);
// symlinks are resolved first, so nothing escapes a root.
import { realpathSync, statSync } from 'fs';
import { resolve } from 'path';

export const deweyRoots = () => (process.env.DEWEY_PATH_ROOTS || '/tank/dropbox/Ocean2.0 Supplemental').split(':').filter(Boolean).map((r) => r.replace(/\/+$/, ''));

/** A server path Dewey may read → its real path; throws 400 otherwise. */
export function allowedPath(p, roots = deweyRoots()) {
  let real;
  try { real = realpathSync(resolve(String(p || ''))); } catch { throw Object.assign(new Error('no such file on the server'), { statusCode: 400 }); }
  if (!roots.some((r) => real === r || real.startsWith(`${r}/`))) throw Object.assign(new Error('that path is outside the folders Dewey may read'), { statusCode: 400 });
  if (!statSync(real).isFile()) throw Object.assign(new Error('not a file'), { statusCode: 400 });
  return real;
}
