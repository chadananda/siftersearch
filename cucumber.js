/**
 * Cucumber.js Configuration
 *
 * BDD tests for SifterSearch behavioral specifications.
 * Many unimplemented features will fail - this is intentional
 * to serve as a development roadmap.
 */

export default {
  default: {
    paths: ['tests/features/**/*.feature'],
    require: ['tests/features/step_definitions/**/*.js', 'tests/features/support/**/*.js'],
    format: ['@cucumber/pretty-formatter', 'html:test-results/cucumber-report.html'],
    formatOptions: { snippetInterface: 'async-await' },
    publishQuiet: true
  },
  // Run only implemented features (for CI)
  implemented: {
    paths: ['tests/features/**/*.feature'],
    require: ['tests/features/step_definitions/**/*.js', 'tests/features/support/**/*.js'],
    tags: '@implemented',
    format: ['@cucumber/pretty-formatter'],
    publishQuiet: true
  },
  // Run pending/unimplemented features (roadmap check)
  pending: {
    paths: ['tests/features/**/*.feature'],
    require: ['tests/features/step_definitions/**/*.js', 'tests/features/support/**/*.js'],
    tags: '@pending or @unimplemented',
    format: ['@cucumber/pretty-formatter'],
    publishQuiet: true
  }
};
