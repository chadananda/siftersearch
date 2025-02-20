# SifterSearch Implementation Plan (v6)

## Reference:

* **[1. Technology](/1-technology.md)**
* **[2. Concepts](/2-concepts.md)**
* **[3. File Layout](/3-files.md)**
* **[4. API Layout](/4-api.md)**
* **[5. SifterChat Web Component](/5-sifterchat.md)**
* **[6. Admin UI](/6-admin-ui.md)**

**Read all Markdown files above** before you start building. Then follow the step-by-step instructions below.

---

## 1. Environment & Repository Setup

- [x] **Node.js v23**
   - Confirm via `node -v`. If needed, install/switch with `nvm`.
- [x] **Empty Repo**
   - The project folder contains `.env`, `.gitignore`, and docs (`1-technology.md`, etc.).
   - `.gitignore` excludes `node_modules`, `*.env`, `*.db`, build artifacts.
   - `.env` holds secrets:
     ```bash
     CLERK_API_KEY=...
     ULTRAVOX_API_KEY=...
     OCR_API_KEY=...
     ```
- [x] **package.json**
   - Minimal scripts:
     ```json
     {
       "scripts": {
         "dev": "node server/index.js",
         "build": "echo 'No build yet'",
         "test": "echo 'No tests yet'",
         "deploy": "npm run test && node scripts/deploy.js"
       }
     }
     ```
- [x] **Install Dependencies**
   - In root:
     ```bash
     npm install fastify @fastify/cors @fastify/rate-limit @fastify/static
     npm install @libsql/client clerk-sdk-node
     npm install --save-dev vitest playwright
     ```
- [x] **Basic Folders**
   - `server/` (Fastify)
   - `libraries/` (DB files)
   - `scripts/` (backup, restore, archive, deploy scripts)
   - `site/` (SvelteKit)

---

## 2. Early Backup/Restore & Deploy Setup

We prioritize **backup/deploy** from the start:

- [ ] **Backup** & **Restore**:
   - `/scripts/backup.js`: runs backups for each DB.
   - `/scripts/restore.js`: tries to fetch DB from B2 if local is missing or corrupted.
   - `/scripts/archive.js`: a daily cron script that moves older backups to archive storage.
- [ ] **DB Creation** only if **restore** fails (no valid backup). We do **not** create empty DBs otherwise.
- [ ] **Deploy** script (`deploy.js`):
   - Possibly calls `npm run test`.
   - Deploys to a versioned folder with sftp. If the new version fails, revert.
   - On success, updates the startup config to point to the new version, restarts.
   - Or a startup script that attempts the new version, falls back if it doesn't start.

**Implementation**:
- We can mock external steps for DigitalOcean or any host from the outset.
- This ensures partial builds can be deployed safely and data remains intact.

---

## 3. Database Schemas (4 DBs) & Vector Indexing

We have four DB schemas; each is created only if restore is impossible:
- [ ] **`app.db`**: superadmin & top-level analytics
- [ ] **`/{libraryId}/library.db`**: library config + references
- [ ] **`/{libraryId}/core_content.db`**: editable text for the core library
- [ ] **`/{libraryId}/index_{collection}.db`**: paragraphs with `par.text`, `par.context`, plus `embedding` for vector search. **Only these indexes** need BM25 + vector indexing.

### Vector & BM25

- For each **index_{collection}.db**:
  - `par.text` + `par.context` for BM25.
  - A column `embedding BLOB` for vector queries.
  - That ensures semantic + textual search from the outset.

### Layered TDD Approach

- Instead of `.sql` files, we can keep the schema in **JS** objects with create-table statements, plus test CRUD methods.
- Each DB init function runs restore first, then if no backup found, runs table creation from these statements.

---

## 4. Unified Dev Server & SvelteKit (Single Port)

- [ ] **One Port**:
   - Use **Fastify** on port 3000.
   - Serve SvelteKit from the same process.
- [ ] **Dev Mode**:
   - `npm run dev` → runs `server/index.js`.
   - If `NODE_ENV=development`, you can run SvelteKit dev or watch.
   - Keep it simple: one terminal for everything.
- [ ] **Local Testing**:
   - The entire system is accessible at `localhost:3000`. Admin UI and public site included.

---

## 5. Backend Development & Route Creation

- [ ] **`server/index.js`**:
   - Register `cors`, `rateLimit`, `static`.
   - Attempt `restoreMainDb()`. If fails, create `app.db`.
   - Possibly integrate SvelteKit dev or serve `/site/build`.
- [ ] **Routes** (`/server/routes/`):
   - `content.js` → `/api/content`
   - `users.js` → `/api/users`
   - `chat.js` → `/api/chat`
   - `tools.js` → `/api/tools`
   - `public/v1` → `/api/v1`
- [ ] **DB On Demand**:
   - Each route referencing a library calls `restoreLibraryDb(...) || createLibraryDb(...)`.
   - If it's an index, call `restoreIndexDb(...) || createIndexDb(...)`.
- [ ] **Testing**:
   - Vitest tests for each route ensuring 200 or correct JSON.
   - Mock external calls (Clerk, Ultravox, Tesseract) early.

---

## 6. SvelteKit & UI Implementation

- [ ] **Initialize SvelteKit** in `/site`:
   ```bash
   npm create svelte@latest .
   ```
- [ ] **Tailwind**:
   ```bash
   npx svelte-add@latest tailwindcss
   ```
- [ ] **UI Layout** (see `6-admin-ui.md`):
   - First screen: public chat & summary.
   - Editor pages for doc listing, metadata, etc.
   - Librarian config, user mgmt, analytics.
- [ ] **SifterChat** (see `5-sifterchat.md`):
   - Develop in SvelteKit.
   - Or compile to single `.js`.
   - Keep personality and knowledge in DB (library.db).
- [ ] **Unified Dev**:
   - We serve everything on port 3000.
   - SvelteKit dev + Fastify in one process.

---

## 7. Backup, Restore & Archive

- [ ] **backup.js**:
   - Backs up `app.db`, any `library.db`, `core_content.db`, `index_*.db`.
   - Renames old to `_timestamp.db`. Keep up to 10. Possibly a `manifest.json`.
- [ ] **restore.js**:
   - If a DB is missing/corrupt, tries to fetch from B2.
   - If that fails, only then create an empty DB.
- [ ] **archive.js**:
   - A daily cron script that moves older backups from the main bucket to cheaper archive storage. Possibly keeps monthly/yearly versions.
- [ ] **Detailed Deploy** (`deploy.js`):
   - SFTP or push code to a **versioned folder** (e.g. `releases/vXYZ`).
   - Attempt to start the new version. If it fails, revert.
   - If successful, switch the startup config, do a final restart.

**All** these steps we can test/mocking external calls.

---

## 8. Testing & Verification (Detailed)

- [ ] **DB Creation & Restore**
   - Start with no DB files.
   - The server tries `restore.js` for `app.db`. If no backup, it creates from JS schema statements.
   - A Vitest test can forcibly remove `app.db`, call an endpoint, watch logs to confirm restore attempt.
- [ ] **Index DB with Vector & BM25**
   - Use your JS-based schema or partial `.sql` to define a table with `text, context, embedding`.
   - Insert test data, confirm a BM25 search for a keyword, a vector search for embedding.
   - Unit test with a known embedding.
- [ ] **Route Stubs**
   - For each route, run Vitest that calls e.g. `/api/content/create`.
   - If it references a library, the route triggers restore or creation, returning 200.
- [ ] **SvelteKit on Single Port**
   - `node server/index.js` in dev mode.
   - The site loads at `http://localhost:3000`. Possibly a SvelteKit dev server integrated.
   - Playwright to test:
     - Anonymous user sees public chat.
     - Editor logs in, sees doc listing.
- [ ] **AI Tools & OCR**
   - For partial OCR, upload small PDF. The route calls `runOcr`. If user chooses partial, it only processes a few pages.
   - Tools calls are tested with mocks.
- [ ] **Backup/Archive**
   - Manually run `backup.js`. Check `_timestamp.db` in B2.
   - `archive.js` might be a daily cron moving older snapshots.
   - If a DB is removed, `restore.js` tries to fetch it next time.
- [ ] **Deployment**
   - `npm run deploy` → run tests.
   - Deploy to `releases/vXYZ`, attempt server start. If fail, revert.
   - If success, re-point the service at that folder.

At each step, ensuring the system meets the TDD or E2E test criteria means the application is correct.

---

## Implementation Stages (No Conclusion)

- [ ] **Read** the reference `.md` docs thoroughly.
- [ ] **Initialize** backup/restore scripts (`backup.js`, `restore.js`, `archive.js`).
- [ ] **Create** a JS-based schema approach (or partial .sql) for each DB, with TDD test CRUD.
- [ ] **Implement** init logic that attempts restore first, then creates DB if none.
- [ ] **Set up** single dev server unifying Fastify + SvelteKit on port 3000.
- [ ] **Build** route stubs (content, users, chat, tools, public v1). Test with Vitest.
- [ ] **Install** SvelteKit in `/site`, add Tailwind, create pages from the admin UI plan.
- [ ] **Develop** SifterChat, referencing library-based personality. Optionally compile to `.js` for external usage.
- [ ] **Integrate** AI tools & partial OCR, focus on doc indexing with vector + BM25.
- [ ] **Run** backups, test restore. Add daily `archive.js`.
- [ ] **Test** thoroughly (Vitest + Playwright).
- [ ] **Deploy** with versioned folder approach (`deploy.js`). If fails, revert.

