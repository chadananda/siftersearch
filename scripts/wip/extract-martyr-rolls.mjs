#!/usr/bin/env node
// Subscription-extraction (Claude Code, NOT an API model) of the Dawn-Breakers
// martyr-roll list-items the adapter fix recovered. Creates ONE durable person
// entity per martyr, scoped to the two books, with provenance in `description`
// so cross-book info accrues to it later. Resolves kinship targets to existing
// entities; never merges distinct same-name martyrs (disambiguated canonicals).
//
// SAFETY: two-books only by construction. sifter.db writes route through the
// single-writer (SIFTER_WRITER_URL); graph.db direct. DRY-RUN by default.
//
//   node scripts/wip/extract-martyr-rolls.mjs            # dry-run (prints records)
//   node scripts/wip/extract-martyr-rolls.mjs --apply
//
// Each ROLL: { provenance, members: [{ cid, canonical, surface, kin? }] }
//  - canonical: disambiguated so each real person is a distinct entity
//  - surface:   the exact text as printed (an alias)
//  - kin:       { relation, target } — target resolved via findEntity, else skipped (logged)

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { query, queryOne, graphQuery } = await import(join(ROOT, 'api/lib/db.js'));
const { findEntity, normalizeSurface } = await import(join(ROOT, 'api/lib/graph-db.js'));

const APPLY = process.argv.includes('--apply');
const DOC = 21308;
const EV = 'cc-subscription-rolls-v1';

// ── ROLLS ─────────────────────────────────────────────────────────────────────
// Framing para 788: "the martyred companions of that village [Míyámay] … as follows".
// 33 enlisted under Mullá Ḥusayn at Míyámay; one (Mullá ‘Ísá) survived. Bábí martyrs,
// fell at Shaykh Ṭabarsí (1849). Same-name collisions disambiguated by para/kin.
const MIYAMAY = {
  provenance: 'Bábí; companion of the village of Míyámay (Khurásán) who enlisted under Mullá Ḥusayn and was martyred at the fort of Shaykh Ṭabarsí, 1849. (The Dawn-Breakers, Míyámay roll.)',
  members: [
    { cid: 23666774, canonical: 'Mullá Muḥammad-Mihdí (Míyámay)',        surface: 'Mullá Muḥammad-Mihdí' },
    { cid: 23666775, canonical: 'Mullá Muḥammad-Jaʿfar (Míyámay)',       surface: 'Mullá Muḥammad-Jaʿfar' },
    { cid: 23666776, canonical: 'Mullá Muḥammad, son of Mullá Muḥammad (Míyámay)', surface: 'Mullá Muḥammad-ibn-i-Mullá Muḥammad' },
    { cid: 23666777, canonical: 'Mullá Raḥím (Míyámay)',                 surface: 'Mullá Raḥím' },
    { cid: 23666778, canonical: 'Mullá Muḥammad-Riḍá (Míyámay)',         surface: 'Mullá Muḥammad-Riḍá' },
    { cid: 23666779, canonical: 'Mullá Muḥammad-Ḥusayn (Míyámay, 794)',  surface: 'Mullá Muḥammad-Ḥusayn' },
    { cid: 23666780, canonical: 'Mullá Muḥammad (Míyámay, 795)',         surface: 'Mullá Muḥammad' },
    { cid: 23666781, canonical: 'Mullá Yúsuf (Míyámay)',                 surface: 'Mullá Yúsuf' },
    { cid: 23666782, canonical: 'Mullá Yaʿqúb (Míyámay)',                surface: 'Mullá Yaʿqúb' },
    { cid: 23666783, canonical: 'Mullá ʿAlí (Míyámay)',                  surface: 'Mullá ʿAlí' },
    { cid: 23666784, canonical: 'Mullá Zaynuʾl-ʿÁbidín (Míyámay)',       surface: 'Mullá Zaynuʾl-ʿÁbidín' },
    { cid: 23666785, canonical: 'Mullá Muḥammad, son of Mullá Zaynuʾl-ʿÁbidín (Míyámay)', surface: 'Mullá Muḥammad, son of Mullá Zaynuʾl-ʿÁbidín', kin: { relation: 'son_of', target: 'Mullá Zaynuʾl-ʿÁbidín (Míyámay)' } },
    { cid: 23666786, canonical: 'Mullá Báqir (Míyámay)',                 surface: 'Mullá Báqir' },
    { cid: 23666787, canonical: 'Mullá ʿAbduʾl-Muḥammad (Míyámay)',      surface: 'Mullá ʿAbduʾl-Muḥammad' },
    { cid: 23666788, canonical: 'Mullá Abuʾl-Ḥasan (Míyámay)',           surface: 'Mullá Abuʾl-Ḥasan' },
    { cid: 23666789, canonical: 'Mullá Ismáʿíl (Míyámay)',               surface: 'Mullá Ismáʿíl' },
    { cid: 23666790, canonical: 'Mullá ʿAbduʾl-ʿAlí (Míyámay)',          surface: 'Mullá ʿAbduʾl-ʿAlí' },
    { cid: 23666791, canonical: 'Mullá Áqá-Bábá (Míyámay)',              surface: 'Mullá Áqá-Bábá' },
    { cid: 23666792, canonical: 'Mullá ʿAbduʾl-Javád (Míyámay)',         surface: 'Mullá ʿAbduʾl-Javád' },
    { cid: 23666793, canonical: 'Mullá Muḥammad-Ḥusayn (Míyámay, 808)',  surface: 'Mullá Muḥammad-Ḥusayn' },
    { cid: 23666794, canonical: 'Mullá Muḥammad-Báqir (Míyámay)',        surface: 'Mullá Muḥammad-Báqir' },
    { cid: 23666795, canonical: 'Mullá Muḥammad (Míyámay, 810)',         surface: 'Mullá Muḥammad' },
    { cid: 23666796, canonical: 'Ḥájí Ḥasan (Míyámay)',                  surface: 'Ḥájí Ḥasan' },
    { cid: 23666797, canonical: 'Karbiláʾí ʿAlí (Míyámay, 812)',         surface: 'Karbiláʾí ʿAlí' },
    { cid: 23666798, canonical: 'Mullá Karbiláʾí ʿAlí (Míyámay)',        surface: 'Mullá Karbiláʾí ʿAlí' },
    { cid: 23666799, canonical: 'Karbiláʾí Núr-Muḥammad (Míyámay)',      surface: 'Karbiláʾí Núr-Muḥammad' },
    { cid: 23666800, canonical: 'Muḥammad-Ibráhím (Míyámay)',            surface: 'Muḥammad-Ibráhím' },
    { cid: 23666801, canonical: 'Muḥammad-Ṣáʾim (Míyámay)',              surface: 'Muḥammad-Ṣáʾim' },
    { cid: 23666802, canonical: 'Muḥammad-Hádí (Míyámay)',               surface: 'Muḥammad-Hádí' },
    { cid: 23666803, canonical: 'Siyyid Mihdí (Míyámay)',                surface: 'Siyyid Mihdí' },
    { cid: 23666804, canonical: 'Abú-Muḥammad (Míyámay)',                surface: 'Abú-Muḥammad' },
  ],
};

const ROLLS = [MIYAMAY];

async function createPerson(canonical, description) {
  await query(`INSERT OR IGNORE INTO graph_entities (canonical_name, name, entity_type, religion, description, source_doc_ids) VALUES (?,?, 'person', '', ?, ?)`,
    [canonical, canonical, description, JSON.stringify([DOC])]);
  const row = await queryOne(`SELECT id FROM graph_entities WHERE canonical_name = ? AND entity_type='person' AND religion=''`, [canonical]);
  return row.id;
}

async function run() {
  let created = 0, mentions = 0, rels = 0, enriched = 0, kinSkipped = 0;
  const localByCanonical = new Map();   // canonical → id (for in-roll kin resolution)

  for (const roll of ROLLS) {
    console.log(`\n=== ROLL: ${roll.members.length} members — ${roll.provenance.slice(0, 70)}… ===`);
    for (const m of roll.members) {
      const desc = roll.provenance;
      if (APPLY) {
        const id = await createPerson(m.canonical, desc);
        localByCanonical.set(m.canonical, id);
        await graphQuery(`INSERT OR IGNORE INTO entity_aliases (entity_id, surface, surface_norm, lang, source, confidence) VALUES (?,?,?, 'en', ?, 0.9)`,
          [id, m.surface, normalizeSurface(m.surface), EV]);
        await graphQuery(`INSERT OR IGNORE INTO entity_mentions (entity_id, content_id, role, resolution_confidence, status, extractor_version) VALUES (?,?, 'subject', 1.0, 'resolved', ?)`,
          [id, String(m.cid), EV]);
        await query(`UPDATE content SET graph_enriched = 1, graph_enriched_at = datetime('now'), extractor_version = ? WHERE id = ?`, [EV, m.cid]);
        created++; mentions++; enriched++;
        if (m.kin) {
          let tgt = localByCanonical.get(m.kin.target) || (await findEntity({ surface: m.kin.target, type: 'person' }))?.entity_id || null;
          if (tgt) { await query(`INSERT INTO graph_relations (source_entity_id, target_entity_id, relation_type, source_doc_id, source_content_id) VALUES (?,?,?,?,?)`, [id, tgt, m.kin.relation, DOC, m.cid]); rels++; }
          else { kinSkipped++; console.log(`   ⚠ kin target unresolved: ${m.canonical} ${m.kin.relation} "${m.kin.target}"`); }
        }
      } else {
        const existing = await findEntity({ surface: m.canonical, type: 'person' });
        console.log(`  [${m.cid}] ${m.canonical}${m.kin ? `  (${m.kin.relation} → ${m.kin.target})` : ''}${existing ? `  ⟵ EXISTS #${existing.entity_id}` : '  + new'}`);
      }
    }
  }
  console.log(`\n${APPLY ? '⚙ APPLIED' : '🔍 DRY-RUN'}: ${ROLLS.reduce((n, r) => n + r.members.length, 0)} members${APPLY ? ` — created ${created} entities, ${mentions} mentions, ${rels} relations, ${enriched} enriched, ${kinSkipped} kin unresolved` : ' (re-run with --apply to write)'}`);
  process.exit(0);
}
run();
