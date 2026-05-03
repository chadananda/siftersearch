// Compatibility shim — re-exports the migration runner from its new home
// under api/lib/migrations/. The original 2,645-line file was split during
// the Phase 4 refactor into version-bucketed sub-files (v1-v25, v26-v45,
// v46-v58) plus a runner that combines them. All existing importers of
// `runMigrations` / `getMigration44SQL` / `CURRENT_VERSION` continue to
// work unchanged.
//
// New code should prefer importing from api/lib/migrations/runner.js
// directly; this shim exists only to preserve historical import paths.

export {
  runMigrations,
  getMigration44SQL,
  migrations,
  userMigrations,
  CURRENT_VERSION,
  USER_DB_CURRENT_VERSION
} from './migrations/runner.js';
