#!/usr/bin/env node

import matter from 'gray-matter';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Find and test a file with multiline description
const basePath = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';
const testPath = join(basePath, "Baha'i/Administrative/Universal House of Justice");

const files = readdirSync(testPath).filter(f => f.includes('2007-08-01'));
console.log('Found files:', files);

if (files.length > 0) {
  const filePath = join(testPath, files[0]);
  console.log('\nTesting:', filePath);

  const content = readFileSync(filePath, 'utf-8');
  const { data } = matter(content);

  console.log('\nParsed frontmatter:');
  console.log('Title:', data.title);
  console.log('Description:', data.description?.substring(0, 200));
  console.log('\nAll keys:', Object.keys(data));
}
