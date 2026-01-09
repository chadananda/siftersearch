/**
 * Script to find and fix documents with invalid YAML frontmatter
 *
 * Scans all markdown files in the library and attempts to fix YAML parsing errors
 * by properly quoting values with special characters.
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';

const LIBRARY_PATH = process.env.LIBRARY_PATH || '/Users/chad/sifter/library/markdown';
const DRY_RUN = !process.argv.includes('--execute');

// Properly quote YAML values to prevent parsing errors
function quoteYamlValue(value) {
  if (typeof value !== 'string') return value;
  const needsQuotes = /[:#[\]{}',&*!|>"'%@`\n\r]|^[\s?|>-]|[\s]$/.test(value) ||
    value === '' ||
    value === 'true' || value === 'false' ||
    value === 'null' || value === 'yes' || value === 'no' ||
    /^[\d.eE+-]+$/.test(value);
  if (needsQuotes) {
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return value;
}

// Serialize metadata back to YAML frontmatter
function serializeYaml(meta) {
  const lines = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(v => quoteYamlValue(v)).join(', ')}]`);
    } else {
      lines.push(`${key}: ${quoteYamlValue(value)}`);
    }
  }
  return lines.join('\n');
}

// Walk directory recursively
async function* walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(path);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      yield path;
    }
  }
}

async function main() {
  console.log(`Scanning ${LIBRARY_PATH} for invalid YAML...`);
  console.log(DRY_RUN ? 'DRY RUN - use --execute to apply fixes\n' : 'EXECUTING fixes\n');

  let scanned = 0;
  let invalid = 0;
  let fixed = 0;
  const errors = [];

  for await (const filePath of walkDir(LIBRARY_PATH)) {
    scanned++;

    try {
      const content = await readFile(filePath, 'utf-8');

      // Try to parse with gray-matter
      try {
        matter(content);
        // Valid YAML, skip
      } catch (parseErr) {
        invalid++;
        const shortPath = filePath.replace(LIBRARY_PATH, '').slice(1);
        console.log(`Invalid: ${shortPath}`);
        console.log(`  Error: ${parseErr.message.slice(0, 80)}`);

        // Try to extract and fix frontmatter manually
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (match) {
          const yamlStr = match[1];
          const body = match[2];

          // Parse YAML manually (simple key-value)
          const meta = {};
          for (const line of yamlStr.split('\n')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const key = line.slice(0, colonIdx).trim();
              let value = line.slice(colonIdx + 1).trim();
              // Remove existing quotes if present
              if ((value.startsWith('"') && value.endsWith('"')) ||
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }
              // Handle arrays
              if (value.startsWith('[') && value.endsWith(']')) {
                try {
                  meta[key] = JSON.parse(value.replace(/'/g, '"'));
                } catch {
                  meta[key] = value;
                }
              } else {
                meta[key] = value;
              }
            }
          }

          // Re-serialize with proper quoting
          const fixedYaml = serializeYaml(meta);
          const fixedContent = `---\n${fixedYaml}\n---\n${body}`;

          // Verify fix works
          try {
            matter(fixedContent);
            fixed++;

            if (!DRY_RUN) {
              await writeFile(filePath, fixedContent, 'utf-8');
              console.log(`  ✓ Fixed`);
            } else {
              console.log(`  Would fix`);
            }
          } catch (verifyErr) {
            errors.push({ path: shortPath, error: verifyErr.message });
            console.log(`  ✗ Could not auto-fix: ${verifyErr.message.slice(0, 60)}`);
          }
        } else {
          errors.push({ path: shortPath, error: 'No frontmatter found' });
          console.log(`  ✗ No frontmatter pattern found`);
        }
      }
    } catch (err) {
      console.error(`Error reading ${filePath}: ${err.message}`);
    }

    if (scanned % 500 === 0) {
      console.log(`... ${scanned} files scanned`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Scanned: ${scanned} files`);
  console.log(`Invalid YAML: ${invalid} files`);
  console.log(`${DRY_RUN ? 'Would fix' : 'Fixed'}: ${fixed} files`);
  console.log(`Unfixable: ${errors.length} files`);

  if (errors.length > 0) {
    console.log(`\nUnfixable files:`);
    for (const { path, error } of errors.slice(0, 10)) {
      console.log(`  ${path}: ${error.slice(0, 50)}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }
}

main().catch(console.error);
