#!/usr/bin/env node
// Scrub tech-stack and meta-conversation references from dialog markdown.
// Conversations should be about ideas, not about how the assistant works.
//
// Targets:
//   - "the search tool", "the search didn't return", "search results"
//   - "based on the search", "I can share", "I was unable to locate"
//   - meta phrases like "let me search", "search and quote" in user turns
//   - replacements aim for idea-focused equivalents, NOT just deletion
//
// Citation URLs (markdown links to siftersearch.com) are KEPT — those are
// references, not tech-talk. Only narrative text mentioning the system gets
// rewritten or removed.

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIALOG_DIR = join(__dirname, '..', 'src/content/dialogs');

// Replacements: pattern → replacement (or empty string to delete sentence)
const REPLACEMENTS = [
  // Jafar self-reference to search tool — replace with idea-focused equivalent
  [/While the search did not yield direct passages? from[^,.]*?[,.]\s*/gi, ''],
  [/The search did not yield[^,.]*?[,.]\s*/gi, ''],
  [/Although the search did not return[^,.]*?[,.]\s*/gi, ''],
  [/I (was|am) unable to locate[^,.]*?[,.]\s*/gi, ''],
  [/It seems I'm not able to locate[^,.]*?[,.]\s*/gi, ''],
  [/I (could not|couldn't) (locate|find) (specific|the exact)[^,.]*?[,.]\s*/gi, ''],
  [/Through the search tool[^,.]*?[,.]\s*/gi, ''],
  [/the search tool at the moment[,.]?/gi, 'the writings'],
  [/the search tool/gi, 'the writings'],
  [/search results/gi, 'the texts'],
  [/Based on the search[,]?\s*/gi, ''],
  [/Search\s+(and|then)\s+quote[.,]?/gi, ''],
  [/Let me search for[^,.]*?[,.]\s*/gi, ''],

  // User-side meta-references
  [/Search and quote\.?/gi, ''],
  [/Use only siftersearch\.com URLs[^.]*\./gi, ''],

  // Jafar describing its own behavior
  [/I'll search for[^,.]*?[,.]\s*/gi, ''],
  [/Let me look for[^,.]*?[,.]\s*/gi, ''],
  [/Through searching[,]?\s*/gi, ''],
  [/After searching[,]?\s*/gi, ''],
  [/After consulting[^,.]*?[,.]\s*/gi, ''],
  [/Based on my search[,]?\s*/gi, ''],
  [/From what I can find[^,.]*?[,.]\s*/gi, ''],
  [/The corpus[^,.]*?(does not|doesn't) (provide|contain|address)[^,.]*?[,.]\s*/gi, ''],

  // Empty-frame fillers that creep in after deletions
  [/^\s*However,\s*/gm, ''],
  [/\.\s+However,\s+(However,\s+)+/g, '. However, '],
];

const DELETE_LINE_PATTERNS = [
  /the search.{0,40}did not (yield|return|provide)/i,
  /unable to (locate|find).{0,40}(via|through|with) (the |a )?search/i,
  /^\s*Through the search/i,
];

function scrubMarkdown(text) {
  // Skip frontmatter
  const fmMatch = text.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!fmMatch) return text;
  const fm = fmMatch[1];
  let body = fmMatch[2];

  for (const [pat, repl] of REPLACEMENTS) {
    body = body.replace(pat, repl);
  }

  // Drop entire lines matching delete-line patterns (only inside paragraphs, not in blockquotes)
  body = body.split('\n').filter(line => {
    if (line.startsWith('>')) return true;  // keep blockquoted citations
    return !DELETE_LINE_PATTERNS.some(p => p.test(line));
  }).join('\n');

  // Collapse multi-blank lines
  body = body.replace(/\n{3,}/g, '\n\n');

  return fm + body;
}

const files = readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md'));
let changed = 0;
let totalChars = 0;
let removedChars = 0;

for (const f of files) {
  const path = join(DIALOG_DIR, f);
  const text = readFileSync(path, 'utf-8');
  const out = scrubMarkdown(text);
  if (out !== text) {
    writeFileSync(path, out);
    changed++;
    totalChars += text.length;
    removedChars += text.length - out.length;
    console.log(`  ${f} (-${text.length - out.length} chars)`);
  }
}

console.log(`\n${changed}/${files.length} dialogs modified`);
console.log(`Removed ${removedChars} characters total`);
