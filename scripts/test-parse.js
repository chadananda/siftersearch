#!/usr/bin/env node

/**
 * Test that parseMarkdownFrontmatter correctly parses YAML frontmatter
 * and handles corrupt description values
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../api/lib/config.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';

const baseDir = config.library.basePath;
const subDir = "Baha'i/Administrative/Universal House of Justice";
const dir = join(baseDir, subDir);

console.log('Base path:', baseDir);
console.log('Testing directory:', dir);

const files = readdirSync(dir).filter(f => f.endsWith('.md') && f.includes('2007-08-01'));

if (files.length > 0) {
  const filePath = join(dir, files[0]);
  console.log('\nTesting file:', files[0]);

  const content = readFileSync(filePath, 'utf-8');
  const { metadata } = parseMarkdownFrontmatter(content);

  console.log('\n=== PARSED FRONTMATTER (via ingester) ===');
  console.log('Title:', metadata.title);
  console.log('Author:', metadata.author);
  console.log('Year:', metadata.year);
  console.log('Description:', metadata.description ? metadata.description.substring(0, 200) + '...' : 'MISSING');
  console.log('Description length:', metadata.description ? metadata.description.length : 0);
  console.log('\nAll metadata keys:', Object.keys(metadata).join(', '));
} else {
  console.log('No matching files found');
}
