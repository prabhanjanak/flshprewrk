/**
 * fix_specialities_prod.mjs
 *
 * Collapses the specialities table from 22 rows → 8 canonical rows (IDs 7–14, program 1).
 *
 * Canonical 8 (KEEP — already correct in prod):
 *   ID 7  → Cornea               (CORN)
 *   ID 8  → Glaucoma             (GLAU)
 *   ID 9  → IOL Fellowship       (IOLF)
 *   ID 10 → Medical Retina       (MEDI)
 *   ID 11 → Oculoplasty          (OCUL)
 *   ID 12 → Pediatric Ophthalmology (PEDI)
 *   ID 13 → Phaco Refractive     (PHAC)
 *   ID 14 → Vitreo Retina        (VITR)
 *
 * Duplicates to re-map then delete:
 *   ID 1  (Vitreo-Retina, prog 1)        → merge into ID 14
 *   ID 3  (Pediatric Retina, prog 1)     → merge into ID 12 (closest: Pediatric Ophthalmology)
 *   ID 4  (Cornea & Anterior Segment, prog 2) → merge into ID 7
 *   ID 5  (Refractive Surgery, prog 2)   → merge into ID 13
 *   ID 6  (Ocular Surface, prog 2)       → merge into ID 7  (closest Anterior segment)
 *   ID 15 (Cornea, prog 3)               → merge into ID 7
 *   ID 16 (Glaucoma, prog 3)             → merge into ID 8
 *   ID 17 (IOL Fellowship, prog 3)       → merge into ID 9
 *   ID 18 (Medical Retina, prog 3)       → merge into ID 10
 *   ID 19 (Oculoplasty, prog 3)          → merge into ID 11
 *   ID 20 (Pediatric Ophthalmology, prog 3) → merge into ID 12
 *   ID 21 (Phaco Refractive, prog 3)     → merge into ID 13
 *   ID 22 (Vitreo Retina, prog 3)        → merge into ID 14
 *
 * Usage (run against PROD via SSH tunnel or direct connection):
 *   DATABASE_URL="postgresql://user:pass@host:5432/dbname" node fix_specialities_prod.mjs
 *
 * Run with --dry-run to preview without committing:
 *   DATABASE_URL="..." node fix_specialities_prod.mjs --dry-run
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Usage: DATABASE_URL="postgresql://..." node fix_specialities_prod.mjs [--dry-run]');
  process.exit(1);
}

// ─── Canonical IDs to KEEP (program 1) ───────────────────────────────────────
const CANONICAL_IDS = [7, 8, 9, 10, 11, 12, 13, 14];

// ─── Merge map: old_id → canonical_id ────────────────────────────────────────
// Each entry: { from: oldId, to: canonicalId, note: 'reason' }
const MERGE_MAP = [
  { from: 1,  to: 14, note: 'Vitreo-Retina (prog 1) → Vitreo Retina' },
  { from: 3,  to: 12, note: 'Pediatric Retina (prog 1) → Pediatric Ophthalmology' },
  { from: 4,  to: 7,  note: 'Cornea & Anterior Segment (prog 2) → Cornea' },
  { from: 5,  to: 13, note: 'Refractive Surgery (prog 2) → Phaco Refractive' },
  { from: 6,  to: 7,  note: 'Ocular Surface (prog 2) → Cornea' },
  { from: 15, to: 7,  note: 'Cornea (prog 3) → Cornea (prog 1)' },
  { from: 16, to: 8,  note: 'Glaucoma (prog 3) → Glaucoma (prog 1)' },
  { from: 17, to: 9,  note: 'IOL Fellowship (prog 3) → IOL Fellowship (prog 1)' },
  { from: 18, to: 10, note: 'Medical Retina (prog 3) → Medical Retina (prog 1)' },
  { from: 19, to: 11, note: 'Oculoplasty (prog 3) → Oculoplasty (prog 1)' },
  { from: 20, to: 12, note: 'Pediatric Ophthalmology (prog 3) → Pediatric Ophthalmology (prog 1)' },
  { from: 21, to: 13, note: 'Phaco Refractive (prog 3) → Phaco Refractive (prog 1)' },
  { from: 22, to: 14, note: 'Vitreo Retina (prog 3) → Vitreo Retina (prog 1)' },
];

// ─── Tables with a speciality_id FK column ───────────────────────────────────
const FK_TABLES = [
  { table: 'candidate_preferences',  column: 'speciality_id' },
  { table: 'applications',           column: 'speciality_id' },
  { table: 'interview_scores',       column: 'speciality_id' },
  { table: 'interview_panels',       column: 'speciality_id' },
  { table: 'doctor_assignments',     column: 'speciality_id' },
  { table: 'allocations',            column: 'speciality_id' },
  { table: 'batch_candidates',       column: 'speciality_id' },
];

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  SPECIALITIES DEDUPLICATION SCRIPT  ${DRY_RUN ? '(DRY RUN — no changes committed)' : '(LIVE MODE)'}`);
  console.log(`${'─'.repeat(70)}\n`);

  try {
    // ── STEP 0: Show current state ──────────────────────────────────────────
    console.log('STEP 0: Current specialities in database\n');
    const current = await client.query(
      'SELECT id, program_id, name, code, seats FROM specialities ORDER BY id'
    );
    console.table(current.rows);
    console.log(`Total: ${current.rows.length} rows\n`);

    if (DRY_RUN) {
      console.log('=== DRY RUN: The following changes WOULD be applied ===\n');
    }

    await client.query('BEGIN');

    // ── STEP 1: Re-map FK references ────────────────────────────────────────
    console.log('STEP 1: Re-mapping foreign key references\n');
    for (const { from, to, note } of MERGE_MAP) {
      for (const { table, column } of FK_TABLES) {
        const check = await client.query(
          `SELECT COUNT(*) FROM ${table} WHERE ${column} = $1`,
          [from]
        );
        const count = parseInt(check.rows[0].count, 10);
        if (count > 0) {
          console.log(`  [${table}.${column}] ${count} row(s): spec_id ${from} → ${to}  (${note})`);
          if (!DRY_RUN) {
            await client.query(
              `UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`,
              [to, from]
            );
          }
        }
      }
    }

    // ── STEP 2: Handle candidate_preferences unique constraint conflicts ──────
    // After remapping, we might have duplicate (candidate_id, speciality_id) rows.
    // Keep the lowest preference_order entry and delete the rest.
    console.log('\nSTEP 2: Deduplicating candidate_preferences after remapping\n');
    const dupPrefs = await client.query(`
      SELECT candidate_id, speciality_id, COUNT(*) as cnt
      FROM candidate_preferences
      GROUP BY candidate_id, speciality_id
      HAVING COUNT(*) > 1
    `);
    if (dupPrefs.rows.length > 0) {
      console.log(`  Found ${dupPrefs.rows.length} duplicate (candidate_id, speciality_id) pairs. Keeping lowest preference_order.`);
      if (!DRY_RUN) {
        await client.query(`
          DELETE FROM candidate_preferences
          WHERE id NOT IN (
            SELECT MIN(id)
            FROM candidate_preferences
            GROUP BY candidate_id, speciality_id
          )
        `);
      }
    } else {
      console.log('  No duplicate candidate_preferences — clean.');
    }

    // ── STEP 3: Handle applications unique conflicts ───────────────────────
    console.log('\nSTEP 3: Deduplicating applications after remapping\n');
    const dupApps = await client.query(`
      SELECT candidate_id, speciality_id, COUNT(*) as cnt
      FROM applications
      GROUP BY candidate_id, speciality_id
      HAVING COUNT(*) > 1
    `);
    if (dupApps.rows.length > 0) {
      console.log(`  Found ${dupApps.rows.length} duplicate applications. Keeping earliest.`);
      if (!DRY_RUN) {
        await client.query(`
          DELETE FROM applications
          WHERE id NOT IN (
            SELECT MIN(id)
            FROM applications
            GROUP BY candidate_id, speciality_id
          )
        `);
      }
    } else {
      console.log('  No duplicate applications — clean.');
    }

    // ── STEP 4: Handle interview_scores duplicates ────────────────────────
    // A doctor may now have two rows for the same (candidate_id, speciality_id).
    // Keep the most recently submitted score.
    console.log('\nSTEP 4: Deduplicating interview_scores after remapping\n');
    const dupScores = await client.query(`
      SELECT candidate_id, doctor_id, speciality_id, COUNT(*) as cnt
      FROM interview_scores
      GROUP BY candidate_id, doctor_id, speciality_id
      HAVING COUNT(*) > 1
    `);
    if (dupScores.rows.length > 0) {
      console.log(`  Found ${dupScores.rows.length} duplicate score tuples. Keeping most recent.`);
      if (!DRY_RUN) {
        await client.query(`
          DELETE FROM interview_scores
          WHERE id NOT IN (
            SELECT DISTINCT ON (candidate_id, doctor_id, speciality_id) id
            FROM interview_scores
            ORDER BY candidate_id, doctor_id, speciality_id, submitted_at DESC
          )
        `);
      }
    } else {
      console.log('  No duplicate interview_scores — clean.');
    }

    // ── STEP 5: Handle seat_matrix_entries name refs ───────────────────────
    // seat_matrix_entries stores speciality as TEXT name, not FK.
    // Normalise old names → canonical names.
    console.log('\nSTEP 5: Normalising seat_matrix_entries.speciality text field\n');
    const nameMap = [
      { old: 'Vitreo-Retina',              canonical: 'Vitreo Retina' },
      { old: 'Pediatric Retina',            canonical: 'Pediatric Ophthalmology' },
      { old: 'Cornea & Anterior Segment',   canonical: 'Cornea' },
      { old: 'Refractive Surgery',          canonical: 'Phaco Refractive' },
      { old: 'Ocular Surface',              canonical: 'Cornea' },
    ];
    for (const { old, canonical } of nameMap) {
      const chk = await client.query(
        `SELECT COUNT(*) FROM seat_matrix_entries WHERE speciality = $1`,
        [old]
      );
      const cnt = parseInt(chk.rows[0].count, 10);
      if (cnt > 0) {
        console.log(`  seat_matrix_entries: "${old}" → "${canonical}" (${cnt} rows)`);
        if (!DRY_RUN) {
          await client.query(
            `UPDATE seat_matrix_entries SET speciality = $1 WHERE speciality = $2`,
            [canonical, old]
          );
        }
      }
    }

    // ── STEP 6: Delete duplicate specialities ─────────────────────────────
    const toDelete = MERGE_MAP.map(m => m.from);
    console.log(`\nSTEP 6: Deleting ${toDelete.length} duplicate specialities: IDs [${toDelete.join(', ')}]\n`);
    if (!DRY_RUN) {
      await client.query(
        `DELETE FROM specialities WHERE id = ANY($1::int[])`,
        [toDelete]
      );
    } else {
      console.log(`  (Dry run) Would delete: ${toDelete.join(', ')}`);
    }

    // ── STEP 7: Verify final state ────────────────────────────────────────
    const finalRows = await client.query(
      'SELECT id, program_id, name, code, seats FROM specialities ORDER BY id'
    );
    console.log('\nSTEP 7: Final specialities after cleanup\n');
    console.table(finalRows.rows);
    console.log(`Total: ${finalRows.rows.length} rows (expected: 8)\n`);

    if (finalRows.rows.length !== 8) {
      console.warn('WARNING: Expected exactly 8 rows but got', finalRows.rows.length);
      console.warn('Rolling back to be safe.\n');
      await client.query('ROLLBACK');
      process.exit(1);
    }

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('DRY RUN complete — all changes rolled back. No data was modified.\n');
      console.log('Re-run without --dry-run to apply.\n');
    } else {
      await client.query('COMMIT');
      console.log('SUCCESS: Specialities deduplication committed to database.\n');
      console.log('The 8 canonical specialities are now the only ones in the system.\n');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nERROR — transaction rolled back:');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
