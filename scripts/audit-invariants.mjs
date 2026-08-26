// Periodic invariant audit — the automated subset of docs/audit-checklist.md.
//
// Every check here exists because something went wrong once and nothing was watching. Run weekly, and
// immediately after any change touching entities, documents, or the writer:
//   node scripts/audit-invariants.mjs           human-readable, exits 1 on violation
//   node scripts/audit-invariants.mjs --json    machine-readable
//
// Checks go through the internal control API (never raw SQL over SSH) so they read exactly what the
// application reads. Adding a check: add the entry to docs/audit-checklist.md, then add it below.
// Deps: .env-secrets (DEPLOY_SECRET), a reachable API.
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

const JSON_OUT = process.argv.includes('--json');
const BASE = process.env.AUDIT_API_BASE || 'http://127.0.0.1:7839';
const KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;

async function get(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'X-Internal-Key': KEY || '' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

// Each: { id, title, incident, run() → { ok, detail, data? } }
// An UNREACHABLE check is reported as such — never as a pass. A check that cannot run has told us nothing.
const INVARIANTS = [
  {
    id: 'merge-tombstone-divergence',
    title: 'No merged entity is served as live',
    incident: '2026-08-24 — 6,668 hollow entities served as live people for months (two definitions of "merged")',
    run: async () => {
      const d = await get('/api/admin/entities/merge-divergence');
      return { ok: d.ok, detail: d.detail, data: { servedButMerged: d.servedButMerged, anyMarker: d.anyMarker } };
    },
  },
  {
    id: 'natural-key-collisions',
    title: 'Live entities have unique natural keys',
    incident: '2026-08-24 — SQLite UNIQUE does not enforce this; 16,318 rows have religion NULL and NULLs compare distinct',
    run: async () => {
      const d = await get('/api/admin/entities/key-collisions');
      return { ok: d.ok, detail: d.detail, data: { collisions: d.collisions, rowsInvolved: d.rowsInvolved, sample: d.sample } };
    },
  },
  {
    id: 'plan-husks',
    title: 'Plan ids point at the canonical copy, not an empty duplicate',
    incident: '2026-08-23 — plan entries pointed at empty duplicates (6555→12511, 15342→14870); "plan exhausted" masked it',
    run: async () => {
      const d = await get('/api/admin/grounding/exhaustion');
      // `husks` means NO PROSE — a genuine defect. `complete` means finished-but-not-yet-graded, which is
      // normal and must never be counted here: conflating the two produced a 607-item false alarm.
      const husks = Number(d.husks || 0);
      return {
        ok: husks === 0,
        detail: husks === 0
          ? `every plan id resolves to a copy holding prose (${d.complete || 0} finished, ${d.enqueueable || 0} enqueueable)`
          : `${husks} plan ids resolve to husks (no prose at all) — resolve each by file_path and title, never by semantic search`,
        data: { husks, complete: d.complete, enqueueable: d.enqueueable, parked: d.parked,
          quarantined: d.quarantined, ids: d.detail?.husks?.slice(0, 20) },
      };
    },
  },
  {
    id: 'gutted-canonicals',
    title: 'No canonical doc has been emptied of its content',
    incident: '2026-06-12→08-25 — 20 OceanLibrary canonicals sat with all 14,588 paragraphs soft-deleted; basic queries (patience, prayer, purity) returned nothing found',
    run: async () => {
      const d = await get('/api/admin/content/gutted-canonicals');
      // `suppressed` — a duplicate_of target that genuinely holds prose — is correct and is NOT a violation.
      // Four of the twenty were invisible precisely because their target was an EMPTY shell, so "has a
      // duplicate_of" is only an explanation when that target actually has content. guttedCanonicals()
      // makes that split; summing the two here would restore the blind spot this check exists to close.
      return { ok: d.ok, detail: d.detail,
        data: { orphaned: d.orphaned, suppressed: d.suppressed, recoverable: d.recoverable,
          recoverableParagraphs: d.recoverableParagraphs, sample: d.sample?.slice(0, 5) } };
    },
  },
  {
    id: 'duplicate-canonicals',
    title: 'Each canonical work has exactly one live copy',
    incident: '2026-08-25 — a title listing showed two "Prayers and Meditations" and read as a dedupe failure; 8301 was in fact soft-deleted with duplicate_of→20805 and the listing endpoint had no deleted_at filter',
    run: async () => {
      const d = await get('/api/admin/content/duplicate-canonicals');
      // LIVE + HOLDING CONTENT, both required. A deleted row is not a duplicate, and an empty row is a husk
      // (invariant 12's concern). Counting either as a duplicate produces false alarms.
      return { ok: d.ok, detail: d.detail, data: { duplicates: d.duplicates, sample: d.sample?.slice(0, 5) } };
    },
  },
];

const results = [];
for (const inv of INVARIANTS) {
  try {
    const r = await inv.run();
    results.push({ ...inv, ...r, reachable: true });
  } catch (err) {
    // Unreachable ≠ healthy. Surface it as a failure so a broken audit can't read as a clean bill.
    results.push({ ...inv, ok: false, reachable: false, detail: `check could not run: ${err.message}` });
  }
}

const failed = results.filter((r) => !r.ok);

if (JSON_OUT) {
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), passed: results.length - failed.length,
    failed: failed.length, results: results.map(({ run, ...r }) => r) }, null, 2));
} else {
  console.log(`\nInvariant audit — ${results.length - failed.length}/${results.length} passing\n`);
  for (const r of results) {
    console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.title}`);
    console.log(`       ${r.detail}`);
    if (!r.ok) console.log(`       incident: ${r.incident}`);
    if (!r.ok && r.data) console.log(`       ${JSON.stringify(r.data)}`);
    console.log('');
  }
  if (failed.length) console.log(`See docs/audit-checklist.md for what each invariant protects.\n`);
}

process.exit(failed.length ? 1 : 0);
