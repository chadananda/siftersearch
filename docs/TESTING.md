# SifterSearch Testing Guide

This guide documents the two-tier BDD testing strategy for SifterSearch.

## Testing Philosophy

All tests use **ARIA-based selectors** for accessibility compliance. This ensures:
1. Tests verify the app works with assistive technologies
2. Selectors are robust (less likely to break with styling changes)
3. We build accessible features by default

## Two-Tier Testing Strategy

### Tier 1: Critical Path Tests (Pre-Deploy Gate)

**Purpose**: Fast, essential tests that MUST pass before every deployment.

**Location**: `tests/features/critical-path/`

**Characteristics**:
- Core user flows only
- Fast execution (< 2 minutes target)
- Deployment blocker if any fail
- Run automatically before every deploy

**Run Critical Path Tests**:
```bash
# Default - runs critical path tests
npm run test:bdd

# Explicit critical path
npm run test:bdd:critical

# Quick smoke tests
npm run test:bdd:smoke
```

**Critical Path Scenarios**:
- Home page loads
- Navigation works
- Basic search returns results
- Library displays documents
- Authentication flow
- Theme toggle
- Error pages work

### Tier 2: Feature Tests (Per-Feature)

**Purpose**: Comprehensive tests for specific features, run when modifying that feature.

**Location**: `tests/features/`

**Characteristics**:
- Deep coverage of one feature
- Longer execution acceptable
- Run when modifying related code
- Not required for every deploy

**Run Feature Tests**:
```bash
# All implemented tests
npm run test:bdd:all

# Specific features
npm run test:bdd:search
npm run test:bdd:library
npm run test:bdd:auth
npm run test:bdd:navigation
npm run test:bdd:a11y

# Pending (roadmap)
npm run test:bdd:pending
```

## Test Execution

### Development Workflow

1. **Before Starting Work**:
   ```bash
   npm run test:bdd:critical  # Verify baseline
   ```

2. **When Modifying a Feature**:
   ```bash
   npm run test:bdd:search    # Run feature tests (if modifying search)
   ```

3. **Before Committing**:
   ```bash
   npm run test:bdd:critical  # Must pass
   ```

4. **Before Deploying**:
   ```bash
   npm run test:bdd           # Run critical path (default)
   ```

### Testing with Production API

```bash
# Start local UI with production API
npm run dev:prod

# Run BDD tests against production API
npm run test:bdd:prod
```

### Headless vs Visual Mode

```bash
# Headless (default, for CI)
npm run test:bdd

# With visible browser
HEADLESS=false npm run test:bdd

# Slow motion for debugging
HEADLESS=false SLOW_MO=500 npm run test:bdd
```

## Writing Tests

### Feature File Structure

```gherkin
@feature-name
Feature: Feature Description
  As a [user type]
  I want to [action]
  So that [benefit]

  # Critical path tests (run every deploy)
  @critical-path @smoke
  Scenario: Essential user flow
    Given I am on the home page
    When I do something important
    Then I should see expected result

  # Feature tests (run when modifying feature)
  @implemented
  Scenario: Detailed behavior
    Given specific precondition
    When user performs action
    Then detailed outcome is verified
```

### ARIA Selector Guidelines

**Always use ARIA roles and labels**:

```javascript
// Good - Uses ARIA role
const nav = this.getByRole('navigation');
const button = this.getByRole('button', { name: 'Submit' });
const searchBox = this.getByRole('searchbox');

// Good - Uses aria-label
const menu = this.getByLabel('User menu');

// Avoid - CSS classes (fragile)
const button = this.page.locator('.submit-btn');

// Avoid - XPath (fragile, accessibility-blind)
const button = this.page.locator('//button[@class="submit"]');
```

**Available ARIA methods**:
- `getByRole(role, { name })` - Find by ARIA role
- `getByLabel(label)` - Find by aria-label
- `getByPlaceholder(text)` - Find by placeholder
- `getByText(text)` - Find by visible text (last resort)
- `getByTestId(id)` - Find by data-testid (escape hatch)

### Step Definition Patterns

```javascript
// Navigation
Given('I am on the home page', async function () {
  await this.goto('/');
});

// ARIA-based actions
When('I click the {string} button', async function (name) {
  await this.clickButton(name);  // Uses getByRole internally
});

// ARIA-based assertions
Then('I should see the navigation bar', async function () {
  const nav = this.getByRole('navigation');
  await this.assertVisible(nav);
});
```

## API Unit Tests

Unit tests for server-side modules live in `tests/api/`. Run with:

```bash
npm test
# or for specific file:
npx vitest tests/api/embedding-cache.test.js
```

### Layered Indexing Test Suite (151 tests, 7 files)

These tests cover the three-layer indexing pipeline introduced with the layered architecture:

| File | Tests | Coverage |
|------|-------|---------|
| `tests/api/embedding-cache.test.js` | 12 | Embedding KV cache DB: init, insert, get, dedup, batch, truncateAndNormalize512() |
| `tests/api/graph-db.test.js` | 19 | Graph DB lifecycle, entity CRUD, relation CRUD, conservative merge rules |
| `tests/api/migration-44.test.js` | 26 | Migration 44 schema: content_objects, content_enrichment, pipeline_versions, pipeline_jobs, layer_sync_state tables |
| `tests/api/pipeline.test.js` | 23 | Pipeline version registry, invalidation rules (text/metadata/object/context/hype), job scheduler, dedup |
| `tests/api/object-extraction.test.js` | 26 | Prompt building, JSON parsing, entity resolution, conservative merging |
| `tests/api/enrichment-layer.test.js` | 29 | Enrichment prompt blocks (instructions, book meta, window, objects, target), deterministic hashing, window sizer |
| `tests/api/graph-api.test.js` | 17 | Graph API handlers (stats, religion graph, entity detail, search), fused search merge |

**Total new tests:** 152 (counts are per `it()` calls in each file)

### What These Tests Cover

**`embedding-cache.test.js`** — Tests `api/lib/embedding-cache.js`:
- `initEmbeddingCache(path)` creates DB and table
- `insertEmbedding()` / `getEmbedding()` round-trip
- Deduplication: same hash+model+dim increments `source_count` without error
- `batchInsertEmbeddings()` for bulk insert
- `truncateAndNormalize512()`: returns exactly 512-element Float32Array, L2 norm ≈ 1.0

**`graph-db.test.js`** — Tests `api/lib/graph-db.js`:
- `initGraphDb(path)` creates `graph_entities` and `graph_relations` tables
- Full entity CRUD: upsert, get, filter by religion/type, fuzzy search
- Relation CRUD: insert, get for entity, get between entities
- Conservative merge: same religion + same type + same canonical_name merges; cross-religion or cross-type never merges

**`migration-44.test.js`** — Tests `api/lib/migrations.js` migration 44:
- All 5 new tables exist with correct columns and UNIQUE constraints
- Validates the layered indexing schema is applied correctly

**`pipeline.test.js`** — Tests `api/lib/pipeline.js` and `api/lib/pipeline-scheduler.js`:
- Version registration, activation (only one active per pipeline)
- `invalidateForTextChange()` marks all layers dirty for a content_id
- `invalidateForMetadataChange()` marks base layer dirty for all doc paragraphs
- `invalidateForObjectVersionChange()` marks object + enrichment dirty
- `invalidateForContextPromptChange()` / `invalidateForHypePromptChange()` — enrichment-only invalidation
- Job scheduler: schedule, dedup pending jobs, get next by layer

**`object-extraction.test.js`** — Tests `api/lib/object-extraction.js` and `api/lib/entity-resolution.js`:
- `buildObjectExtractionPrompt()` returns system + user prompt with doc metadata
- `parseObjectResponse()` handles valid JSON, markdown fences, nulls, empty arrays
- `renderObjectsForPrompt()` is deterministic with sorted keys
- `renderObjectsForMeili()` returns flat searchable string
- Entity resolution: conservative cross-tradition-safe merging logic

**`enrichment-layer.test.js`** — Tests `api/lib/enrichment-prompts.js` and `api/lib/window-sizer.js`:
- Each prompt block builder returns `{ text, hash }` with deterministic output
- Identical inputs produce byte-identical hashes (required for vLLM prefix cache hits)
- Fixed field order in book meta block
- `computeWindowN()` returns conservative N within KV token budget
- Hard limit and minimum N enforced

**`graph-api.test.js`** — Tests `api/routes/graph.js` handler functions:
- `getGraphStats()` returns per-religion entity/relation counts
- `getGraphForReligion()` returns nodes + edges with correct fields, entityTypes filter
- `searchGraphEntities()` with and without religion filter
- `getEntityDetail()` returns entity + connected entities + relations + source documents
- Fused search: `mergeSearchResults()` merges by paragraph ID, preserves both base and enhanced fields

## Directory Structure

```
tests/
├── features/
│   ├── critical-path/           # Tier 1: Pre-deploy tests
│   │   └── critical-path.feature
│   ├── step_definitions/        # Step implementations
│   │   ├── common.steps.js
│   │   ├── critical-path.steps.js
│   │   ├── navigation.steps.js
│   │   └── ...
│   ├── support/                 # Test infrastructure
│   │   ├── world.js            # Cucumber world with Playwright
│   │   ├── hooks.js            # Setup/teardown
│   │   └── playwright-world.js # Browser automation helpers
│   ├── search.feature          # Tier 2: Feature test
│   ├── navigation.feature
│   ├── library-browser.feature
│   └── ...
└── api/                        # Unit tests (vitest)
    ├── embedding-cache.test.js # Embedding KV cache
    ├── graph-db.test.js        # Entity graph DB
    ├── migration-44.test.js    # Layered indexing schema migration
    ├── pipeline.test.js        # Pipeline version registry + job scheduler
    ├── object-extraction.test.js # LLM extraction + entity resolution
    ├── enrichment-layer.test.js  # Enrichment prompts + window sizer
    ├── graph-api.test.js       # Graph API handlers + fused search
    └── ...                     # Existing tests (search, auth, ingester, etc.)
```

## Configuration

### cucumber.js Profiles

| Profile | Purpose | Command |
|---------|---------|---------|
| `default` | Critical path (pre-deploy) | `npm run test:bdd` |
| `critical` | Critical path explicit | `npm run test:bdd:critical` |
| `smoke` | Quick sanity check | `npm run test:bdd:smoke` |
| `all` | All implemented tests | `npm run test:bdd:all` |
| `search` | Search feature | `npm run test:bdd:search` |
| `library` | Library feature | `npm run test:bdd:library` |
| `auth` | Authentication | `npm run test:bdd:auth` |
| `navigation` | Navigation | `npm run test:bdd:navigation` |
| `accessibility` | Accessibility | `npm run test:bdd:a11y` |
| `pending` | Roadmap tests | `npm run test:bdd:pending` |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UI_URL` | `http://localhost:5173` | Frontend URL |
| `API_URL` | `http://localhost:3000` | API URL |
| `HEADLESS` | `true` | Run browser headless |
| `SLOW_MO` | `0` | Slow motion delay (ms) |

## Adding New Tests

### For a New Critical Path Test

1. Add scenario to `tests/features/critical-path/critical-path.feature`
2. Tag with `@critical-path` and optionally `@smoke`
3. Implement steps in `tests/features/step_definitions/critical-path.steps.js`
4. Use ARIA selectors
5. Keep it fast and essential

### For a New Feature Test

1. Create or update feature file: `tests/features/{feature}.feature`
2. Tag with `@implemented` (or `@pending` if not yet working)
3. Implement steps in `tests/features/step_definitions/{feature}.steps.js`
4. Add profile to `cucumber.js` if needed
5. Add npm script to `package.json`

## Troubleshooting

### Tests Timeout

```bash
# Increase timeout (default 60s)
DEBUG=true npm run test:bdd
```

### Can't Find Element

1. Check ARIA role/label in browser DevTools
2. Verify element is visible and enabled
3. Try `HEADLESS=false` to watch execution

### Screenshots on Failure

Failed tests automatically save screenshots to `test-results/screenshots/`.

## CI/CD Integration

```yaml
# Example GitHub Actions
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install chromium
    - run: npm run test:bdd:critical  # Gate on critical path
```
