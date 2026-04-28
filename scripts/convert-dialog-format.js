#!/usr/bin/env node
// Idempotent: convert "## You" / "## Jafar" headers in dialog markdown to
// <div class="user-turn" id="round-N"> / <div class="jafar-turn"> wrappers
// so the detail page can style each speaker visually + anchor TOC links.

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIALOG_DIR = join(__dirname, '..', 'src/content/dialogs');

let changed = 0;
for (const f of readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md'))) {
  const path = join(DIALOG_DIR, f);
  const original = readFileSync(path, 'utf-8');
  const m = original.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!m) continue;
  const fm = m[1];
  let body = m[2];
  const before = body;

  // Step 1: convert any remaining "## You" / "## Jafar" headers to wrappers.
  if (/^## (You|Jafar)/m.test(body)) {
    body = body.replace(/^---\s*$/gm, '');
    body = body.replace(
      /(^|\n)## (You|Jafar)\n+([\s\S]*?)(?=\n## (?:You|Jafar)\n|\n*$)/g,
      (_, lead, speaker, content) => {
        const cls = speaker === 'You' ? 'user-turn' : 'jafar-turn';
        return `${lead || ''}<div class="${cls}">\n\n${content.trim()}\n\n</div>\n\n`;
      }
    );
  }

  // Step 2: ensure each user-turn has id="round-N". Idempotent: only adds
  // an id to user-turn divs that don't already have one.
  let r = 0;
  body = body.replace(/<div class="user-turn"(\s+id="[^"]*")?>/g, (match, existingId) => {
    r++;
    if (existingId) return match;  // already has id, leave it
    return `<div class="user-turn" id="round-${r}">`;
  });

  body = body.replace(/\n{3,}/g, '\n\n');

  if (body !== before) {
    writeFileSync(path, fm + body);
    changed++;
    console.log(`  ${f}`);
  }
}
console.log(`\nUpdated ${changed} dialog files.`);
