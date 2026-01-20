#!/usr/bin/env node

/**
 * Test that gray-matter correctly parses YAML frontmatter
 */

import matter from 'gray-matter';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from '../api/lib/config.js';

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
  const { data } = matter(content);

  console.log('\n=== PARSED FRONTMATTER ===');
  console.log('Title:', data.title);
  console.log('Author:', data.author);
  console.log('Year:', data.year);
  console.log('Description:', data.description ? data.description.substring(0, 200) + '...' : 'MISSING');
  console.log('Description length:', data.description ? data.description.length : 0);
  console.log('\nAll frontmatter keys:', Object.keys(data).join(', '));
} else {
  console.log('No matching files found');
}
