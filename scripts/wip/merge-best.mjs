// For each article (200-219), compare the score in tmp/wip/backup-rejudged
// (the calibrated-judge version of original conversations) with the current
// score in src/content/dialogs (post-rerun version). Restore the backup if
// it scored higher. This keeps each article at its highest score across
// the iteration loops.

import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DIALOGS_DIR = join(ROOT, 'src/content/dialogs');
const SCORES_DIR = join(ROOT, 'tmp-scores');
const BACKUP_DIR = join(ROOT, 'tmp/wip/backup-iter4');

function readScore(jsonPath) {
  if (!existsSync(jsonPath)) return null;
  try {
    const j = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    return Math.round(j.overall || 0);
  } catch { return null; }
}

const slugs = [];
for (let i = 200; i <= 219; i++) {
  const fnames = readdirSync(BACKUP_DIR).filter(f => f.startsWith(String(i) + '-') && f.endsWith('.md'));
  if (fnames.length > 0) slugs.push(fnames[0].replace(/\.md$/, ''));
}

let restored = 0;
let kept = 0;

for (const slug of slugs) {
  const backupMd = join(BACKUP_DIR, `${slug}.md`);
  const backupSc = join(BACKUP_DIR, `${slug}.json`);
  const liveMd = join(DIALOGS_DIR, `${slug}.md`);
  const liveSc = join(SCORES_DIR, `${slug}.json`);

  const backupScore = readScore(backupSc);
  const liveScore = readScore(liveSc);

  if (backupScore == null && liveScore == null) {
    console.log(`  ${slug}: no scores either side, skipping`);
    continue;
  }

  if (backupScore == null) {
    console.log(`  ${slug}: backup missing, keeping live (${liveScore}%)`);
    kept++;
    continue;
  }

  if (liveScore == null || backupScore > liveScore) {
    copyFileSync(backupMd, liveMd);
    copyFileSync(backupSc, liveSc);
    console.log(`  ${slug}: restored backup (${backupScore}% > ${liveScore ?? 'none'}%)`);
    restored++;
  } else {
    console.log(`  ${slug}: kept live (${liveScore}% >= ${backupScore}%)`);
    kept++;
  }
}

console.log(`\nRestored ${restored}, kept ${kept}.`);
