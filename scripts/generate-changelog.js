#!/usr/bin/env node

/**
 * Changelog generator for SifterSearch
 *
 * Extracts recent commits and formats them as a user-friendly "What's New" list.
 * Outputs JSON that can be imported at build time.
 *
 * Usage:
 *   node scripts/generate-changelog.js [--count=10]
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'src', 'lib', 'changelog.json');

// Parse args
const args = process.argv.slice(2);
const countArg = args.find(a => a.startsWith('--count='));
const count = countArg ? parseInt(countArg.split('=')[1], 10) : 50; // Default to 50 entries (~1 month)

// Get recent commits with conventional commit format
// Format: hash|date|subject
const gitLog = execSync(
  `git log --pretty=format:"%h|%as|%s" -n ${count * 2}`,
  { encoding: 'utf-8', cwd: join(__dirname, '..') }
).trim();

if (!gitLog) {
  console.log('No commits found');
  process.exit(0);
}

const commits = gitLog.split('\n').map(line => {
  const [hash, date, subject] = line.split('|');
  return { hash, date, subject };
});

// Parse conventional commits and make user-friendly
function parseCommit(commit) {
  const { hash, date, subject } = commit;

  // Match conventional commit format: type(scope): description
  // or type: description
  const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);

  if (!conventionalMatch) {
    return null; // Skip non-conventional commits
  }

  const [, type, scope, description] = conventionalMatch;

  // Skip certain types that aren't user-facing
  const skipTypes = ['chore', 'ci', 'test', 'build', 'docs', 'style', 'refactor'];
  if (skipTypes.includes(type.toLowerCase())) {
    return null;
  }

  // Map commit types to user-friendly labels
  const typeLabels = {
    feat: 'New',
    fix: 'Fixed',
    perf: 'Improved',
    security: 'Security'
  };

  const label = typeLabels[type.toLowerCase()] || 'Updated';

  // Clean up description
  let cleanDescription = description
    .replace(/\s*\(#\d+\)$/, '') // Remove PR numbers
    .replace(/🤖.*$/, '') // Remove bot signatures
    .trim();

  // Capitalize first letter
  cleanDescription = cleanDescription.charAt(0).toUpperCase() + cleanDescription.slice(1);

  return {
    hash,
    date,
    type: label,
    description: cleanDescription,
    scope: scope || null
  };
}

// Process commits
const changelog = commits
  .map(parseCommit)
  .filter(Boolean)
  .slice(0, count);

// Group by date for display
const grouped = {};
changelog.forEach(entry => {
  if (!grouped[entry.date]) {
    grouped[entry.date] = [];
  }
  grouped[entry.date].push(entry);
});

// Output structure
const output = {
  generated: new Date().toISOString(),
  entries: changelog,
  grouped
};

// Write to file
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`Changelog generated with ${changelog.length} entries -> ${outputPath}`);

// Also output the formatted list
console.log('\nRecent changes:');
changelog.forEach(entry => {
  console.log(`  ${entry.type}: ${entry.description}`);
});
