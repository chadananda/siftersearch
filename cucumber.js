/**
 * Cucumber.js Configuration
 *
 * BDD tests for SifterSearch behavioral specifications.
 * Many unimplemented features will fail - this is intentional
 * to serve as a development roadmap.
 */

const common = {
  paths: ['tests/features/**/*.feature'],
  import: ['tests/features/step_definitions/*.js', 'tests/features/support/*.js'],
  formatOptions: { snippetInterface: 'async-await' },
  publishQuiet: true
};

// Default configuration
export default {
  ...common,
  format: ['@cucumber/pretty-formatter', 'html:test-results/cucumber-report.html']
};

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
