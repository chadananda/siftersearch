# 3. File Organization

Below is an **updated** solution incorporating:

1. **SifterChat components** in the SvelteKit `/site/src/components/sifterchat/` folder.
2. A **single manifest per DB** (one for each `library.db`, `index_core.db`, `index_site_{domain}.db`, etc.).
3. A **global dedup filestore** at `{bucket}/library/{libraryId}/files/{hash.ext}` for all library-level assets.
4. A separate path `{bucket}/library/{libraryId}/userfiles/` for user uploads with unique names.
5. The rest of the design remains minimal and TDD-friendly.

---

## 1. Directory Structure

```
/siftersearch
├── /site                                 # SvelteKit-based front-end
│   ├── package.json
│   ├── svelte.config.js
│   ├── /src
│   │   ├── /routes                      # Main app & admin pages
│   │   ├── /components
│   │   │   └── /sifterchat             # SifterChat components
│   │   │       ├── SifterChat.svelte   # Possibly your main chat UI
│   │   │       └── index.js            # If using multiple pieces
│   │   ├── /lib                        # Reusable Svelte utilities
│   │   └── /stores                     # Svelte stores
│   └── /static                         # Static assets (icons, etc.)
|
├── /server                              # Fastify API & business logic
│   ├── db.js                            # Single code path for DB open/attach if needed
│   ├── /routes
│   │   ├── tools.js                    # /api/tools for agentic tools
│   │   ├── content.js                  # /api/content for doc editing
│   │   ├── users.js                    # /api/users for user mgmt
│   │   └── ... other endpoints
│   ├── /services
│   │   ├── db.js                       # Basic CRUD calls, TDD tested
│   │   ├── search.js                   # Basic search logic
│   │   ├── search_ai.js               # AI re-ranking
│   │   ├── content_edit.js            # Content editing & diffs
│   │   ├── content_edit_ai.js         # AI suggestions for editing
│   │   ├── user_management.js         # Create/edit users, roles
│   │   └── ...
│   ├── /tools                          # Agentic library tools
│   │   ├── /shared
│   │   │   ├── search_results.js
│   │   │   ├── documents.js
│   │   │   ├── analytics.js
│   │   │   ├── web_results.js
│   │   │   ├── deep_web_results.js
│   │   │   └── ...
│   │   ├── /ocean                      # Library-specific tools
│   │   │   ├── bahai_tablets.js
│   │   │   ├── best_known_works.js
│   │   │   ├── ocean_results.js
│   │   │   ├── ctai_translation.js
│   │   │   ├── compilation.js
│   │   │   ├── deep_research.js
│   │   │   ├── deep_article.js
│   │   │   └── ...
│   │   └── index.js                    # Merges shared + library-specific tools
│   ├── /utils
│   └── index.js                       # Main server entry
|
├── /libraries                          # On-disk DB files
│   ├── app.db                          # Global superadmin DB
│   ├── /ocean
│   │   ├── library.db                  # Library config & local user data
│   │   ├── index_core.db               # Paragraph index for main content
│   │   ├── core_content.db             # Editable text & version histories
│   │   ├── index_site_oceanlibrary.org.db
│   │   └── ...
│   └── ...other libraries...
|
└── /scripts                            # Maintenance / background scripts
    ├── backup.js                      # Creates DB snapshots (schedulable)
    ├── daily_archive.js               # Moves older backups to cheaper storage
    ├── deploy.js                      # Runs tests, updates production
    ├── add_context.js                 # Long-running script for paragraph context
    └── restore.js (optional)          # Manual restore if needed
```

**New:** The SifterChat components exist in `/site/src/components/sifterchat/`. The rest is as before.

---

## 2. Global Dedup Filestore (Per Library)

### B2 Bucket Paths

```
{bucket}/library/{libraryId}/files/{hash.ext}
```

- Each file is hashed, e.g. `sha256abcdef...`. Then we store it as `abc123.pdf` or `.png`, etc.
- The DB references that file by its hash.
- If multiple docs or site indexes reference the same file, we only store it once.

### User Uploads

```
{bucket}/library/{libraryId}/userfiles/{unique-code}.{ext}
```

- This is for user-specific files not subject to dedup, or if you prefer a stable link.
- The system can generate a short unique code (like a 10-char random) and track the extension.

---

## 3. One `manifest.json` per Database

- Each **database** (`library.db`, `index_core.db`, `index_site_{domain}.db`) has **one** `manifest.json` that lists the files it references. Example:

```json
{
  "timestamp": "2023-09-10T12:00:00Z",
  "dbHash": "sha256:abc123...",
  "files": [
    {
      "hash": "sha256:9876...",
      "filename": "file_9876.pdf",
      "size": 348920,
      "references": ["docId=1234", "parId=42"]
    },
    ...
  ]
}
```

- When we delete a database entirely, we can safely remove any files that appear only in that DB’s manifest and not in others.
- The backup script updates the manifest whenever new files are introduced.

---

## 4. Backup Process & Archive

1. **No Timestamps** for the main DB file. We upload `_new.db`, rename old to `_timestamp.db`, rename `_new.db` to `.db`.
2. We keep up to 10 versions in `current/`.
3. **Daily** archive copies the latest DB + `manifest.json` into an `archive/daily/` folder. Over time, we prune older daily backups into weekly, monthly, etc.
4. If we remove an old daily backup, we examine its `manifest.json` and see if any file references become zero across all other manifests.
5. If no references remain for a file (like `sha256:9876...`), we remove it from B2.

---

## 5. TDD Layers & Minimal Design

1. We have a single `db.js` in `/services` for raw CRUD.
2. Each route (`content.js`, `users.js`, etc.) verifies role-based tokens.
3. Shared Tools in `server/tools/shared`, library-specific in `server/tools/[libraryId]`.
4. The SvelteKit site in `/site` includes a `sifterchat` components folder.
5. **Global** dedup files in `{bucket}/library/{libraryId}/files/{hash.ext}`, plus user uploads in `{bucket}/library/{libraryId}/userfiles/`.

---

## 6. Conclusion

By using **one manifest per DB** and a **global dedup filestore** (with userfiles in a separate path), the system:

- Minimizes duplication.
- Allows easy cleaning of unused files upon DB or snapshot removal.
- Preserves each DB’s references in a single manifest.
- Retains a straightforward TDD-friendly structure and minimal duplication.

This final approach satisfies your requirements for SifterChat components, library-based dedup, userfiles, and consistent backups across each content DB.