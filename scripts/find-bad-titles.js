#!/usr/bin/env node

import { queryAll } from "../api/lib/db.js";

// Find docs with potentially malformed titles
const docs = await queryAll(`
  SELECT id, title, file_path
  FROM docs
  WHERE (title LIKE '"%' OR title LIKE '>-%' OR title = 'Untitled')
    AND deleted_at IS NULL
`);

console.log("Found", docs.length, "docs with potentially bad titles");
for (const d of docs) {
  console.log(d.id, "|", d.title?.substring(0, 50), "|", d.file_path?.substring(0, 40));
}
process.exit(0);
