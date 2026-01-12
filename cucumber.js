/**
 * Cucumber.js Configuration
 *
 * Two-tier testing strategy:
 * 1. Critical Path Tests (@critical-path) - Run before EVERY deploy
 *    - Core user flows that MUST work
 *    - Fast execution (< 2 minutes)
 *    - Gate for deployments
 *
 * 2. Feature Tests - Run when modifying specific features
 *    - Comprehensive coverage per feature
 *    - Longer execution time acceptable
 *    - Run via profile (e.g., --profile search)
 *
 * All tests use ARIA-based selectors for accessibility compliance.
 */

const common = {
  paths: ['tests/features/**/*.feature'],
  import: ['tests/features/step_definitions/*.js', 'tests/features/support/*.js'],
  formatOptions: { snippetInterface: 'async-await' },
  publishQuiet: true
};

// ============================================
// TIER 1: Critical Path (pre-deploy gate)
// ============================================

// Default: Run critical path tests before every deploy
export default {
  ...common,
  paths: ['tests/features/critical-path/**/*.feature'],
  tags: '@critical-path',
  format: ['@cucumber/pretty-formatter', 'html:test-results/critical-path-report.html']
};

// Alias for explicit critical path run
export const critical = {
  ...common,
  paths: ['tests/features/critical-path/**/*.feature'],
  tags: '@critical-path',
  format: ['@cucumber/pretty-formatter']
};

// Smoke tests (quick sanity check)
export const smoke = {
  ...common,
  paths: ['tests/features/critical-path/**/*.feature'],
  tags: '@smoke',
  format: ['@cucumber/pretty-formatter']
};

// ============================================
// TIER 2: Feature Tests (per-feature)
// ============================================

// All implemented features (comprehensive)
export const all = {
  ...common,
  tags: '@implemented',
  format: ['@cucumber/pretty-formatter', 'html:test-results/cucumber-report.html']
};

// Individual feature profiles
export const search = {
  ...common,
  paths: ['tests/features/search.feature', 'tests/features/critical-path/**/*.feature'],
  tags: '@implemented and (@search or @critical-path)',
  format: ['@cucumber/pretty-formatter']
};

export const library = {
  ...common,
  paths: ['tests/features/library-browser.feature', 'tests/features/critical-path/**/*.feature'],
  tags: '@implemented and (@library or @critical-path)',
  format: ['@cucumber/pretty-formatter']
};

export const auth = {
  ...common,
  paths: ['tests/features/authentication.feature', 'tests/features/critical-path/**/*.feature'],
  tags: '@implemented and (@auth or @critical-path)',
  format: ['@cucumber/pretty-formatter']
};

export const navigation = {
  ...common,
  paths: ['tests/features/navigation.feature', 'tests/features/critical-path/**/*.feature'],
  tags: '@implemented and (@navigation or @critical-path)',
  format: ['@cucumber/pretty-formatter']
};

// Quick search mode tests
export const quicksearch = {
  ...common,
  paths: ['tests/features/quick-search.feature'],
  tags: '@implemented and @quick-search',
  format: ['@cucumber/pretty-formatter']
};

export const accessibility = {
  ...common,
  paths: ['tests/features/accessibility.feature', 'tests/features/critical-path/**/*.feature'],
  tags: '@implemented and (@a11y or @accessibility or @critical-path)',
  format: ['@cucumber/pretty-formatter']
};

// ============================================
// Development & CI Profiles
// ============================================

// Run only implemented features (for CI)
export const implemented = {
  ...common,
  tags: '@implemented',
  format: ['@cucumber/pretty-formatter']
};

// Run pending/unimplemented features (roadmap check)
export const pending = {
  ...common,
  tags: '@pending or @unimplemented',
  format: ['@cucumber/pretty-formatter']
};

// Watch mode for development
export const dev = {
  ...common,
  paths: ['tests/features/critical-path/**/*.feature'],
  tags: '@critical-path',
  format: ['@cucumber/pretty-formatter']
};
