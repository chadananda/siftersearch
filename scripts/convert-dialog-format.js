#!/usr/bin/env node
// One-shot: convert "## You" / "## Jafar" headers in existing dialog markdown
// to <div class="user-turn"> / <div class="jafar-turn"> wrappers so the
// detail page can style each speaker visually instead of relying on labels.

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIALOG_DIR = join(__dirname, '..', 'src/content/dialogs');

let changed = 0;
for (const f of readdirSync(DIALOG_DIR).filter(f => f.endsWith('.md'))) {
  const path = join(DIALOG_DIR, f);
  const text = readFileSync(path, 'utf-8');
  if (!text.includes('## You')) continue;  // already converted

  const m = text.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!m) continue;
  const fm = m[1];
  let body = m[2];

  // Replace "## You\n\n<content>\n" blocks. Tricky because content can be
  // multiline. Use a regex that captures up to the next "##" or end of file.
  // Strip "---" separators between rounds — visual divider handled in CSS.
  body = body.replace(/^---\s*$/gm, '');
  body = body.replace(/\n## (You|Jafar)\n+([\s\S]*?)(?=\n## (?:You|Jafar)\n|\n*$)/g,
    (_, speaker, content) => {
      const cls = speaker === 'You' ? 'user-turn' : 'jafar-turn';
      return `\n<div class="${cls}">\n\n${content.trim()}\n\n</div>\n\n`;
    }
  );
  // Handle the very-first turn (no preceding newline)
  body = body.replace(/^## (You|Jafar)\n+([\s\S]*?)(?=\n<div class="|\n## (?:You|Jafar)\n|\n*$)/,
    (_, speaker, content) => {
      const cls = speaker === 'You' ? 'user-turn' : 'jafar-turn';
      return `<div class="${cls}">\n\n${content.trim()}\n\n</div>\n\n`;
    }
  );

  // Collapse runs of blank lines
  body = body.replace(/\n{3,}/g, '\n\n');

  writeFileSync(path, fm + body);
  changed++;
  console.log(`  ${f}`);
}
console.log(`\nConverted ${changed} dialog files.`);
