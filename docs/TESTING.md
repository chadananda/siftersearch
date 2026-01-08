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
└── api/                        # Unit tests
    └── ...
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
