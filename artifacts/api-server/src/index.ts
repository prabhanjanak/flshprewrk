import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, applicationFormsTable, programsTable, candidatesTable, applicationSubmissionsTable, specialitiesTable, candidatePreferencesTable, applicationsTable, globalSettingsTable } from "@workspace/db";
import { eq, sql, ilike, and, or } from "drizzle-orm";
import { parseSpecializationString } from "./lib/utils";

import { DEFAULT_SECTIONS } from "./lib/default-sections";

const rawPort = process.env["PORT"] || "5001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception");
});

// Correct bcrypt hash for Saravanan@2026 — used to normalise both dev and prod
const SARAVANAN_PASSWORD_HASH = "$2b$10$tzKB/Dj.bn.MPCUj5GJQz.V6.ijFrypzqkwSjMW458ni7dCAx0MuS";

async function runStartupFixes() {
  // Migration: global_settings table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS global_settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Migration: add new columns if they don't exist
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed TEXT`);

  // Migration: create seat_matrix_entries table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seat_matrix_entries (
      id SERIAL PRIMARY KEY,
      speciality TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      total_seats INTEGER NOT NULL DEFAULT 0,
      allocated_seats INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migration: add program_id column to seat_matrix_entries
  await db.execute(sql`ALTER TABLE seat_matrix_entries ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES programs(id)`);
  await db.execute(sql`ALTER TABLE seat_matrix_entries DROP CONSTRAINT IF EXISTS seat_matrix_entries_speciality_unit_name_key`);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seat_matrix_entries_prog_spec_unit_key') THEN
        ALTER TABLE seat_matrix_entries ADD CONSTRAINT seat_matrix_entries_prog_spec_unit_key UNIQUE (program_id, speciality, unit_name);
      END IF;
    END $$
  `);
  await db.execute(sql`
    UPDATE seat_matrix_entries SET program_id = (SELECT id FROM programs ORDER BY id LIMIT 1) WHERE program_id IS NULL
  `);

  // Migration: create payment_settings table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_settings (
      id SERIAL PRIMARY KEY,
      program_id INTEGER,
      razorpay_key_id TEXT,
      razorpay_key_secret TEXT,
      amount INTEGER NOT NULL DEFAULT 275000,
      currency TEXT NOT NULL DEFAULT 'INR',
      description TEXT NOT NULL DEFAULT 'Fellowship Application Fee',
      mode TEXT NOT NULL DEFAULT 'test',
      upi_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Migration: add upi_id column if missing (for existing tables)
  await db.execute(sql`ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS upi_id TEXT`);

  // Migration: custom fields on application_forms
  await db.execute(sql`ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]'::jsonb`);

  // Migration: custom answers on application_submissions
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb`);

  // Migration: google_forms_config on application_forms
  await db.execute(sql`ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS google_forms_config JSONB DEFAULT NULL`);

  // Migration: source column on application_submissions ('internal' | 'google_forms')
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal'`);

  // Migration: ready_for_review flag on application_submissions
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS ready_for_review BOOLEAN NOT NULL DEFAULT FALSE`);

  // Migration: google_forms_response_id for deduplication
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS google_forms_response_id TEXT`);
  
  // Migration: form_data JSONB on application_submissions
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT '{}'::jsonb`);

  // Migration: google_sheets_config on application_forms
  await db.execute(sql`ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS google_sheets_config JSONB DEFAULT NULL`);

  // Migration: google_sheets_row_id for deduplication
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS google_sheets_row_id TEXT`);

  // Migration: add display_operator role to enum (must run outside transaction - best-effort)
  try { await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'display_operator'`); } catch (_) { /* already exists */ }

  // Migration: interview_panels table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interview_panels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      room_number TEXT NOT NULL,
      program_id INTEGER REFERENCES programs(id),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Migration: interview_panel_members table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interview_panel_members (
      id SERIAL PRIMARY KEY,
      panel_id INTEGER NOT NULL REFERENCES interview_panels(id) ON DELETE CASCADE,
      doctor_id INTEGER NOT NULL REFERENCES users(id),
      is_main BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(panel_id, doctor_id)
    )
  `);

  // Migration: add marks_entry_enabled column (allows multiple enabled doctors per panel)
  await db.execute(sql`ALTER TABLE interview_panel_members ADD COLUMN IF NOT EXISTS marks_entry_enabled BOOLEAN NOT NULL DEFAULT FALSE`);

  // Migration: drop the old partial unique index that blocked multiple enabled doctors.
  // We now allow multiple doctors per panel to have marks_entry_enabled = TRUE (their scores are averaged).
  try { await db.execute(sql.raw(`DROP INDEX IF EXISTS panel_marks_entry_unq`)); } catch (_) { /* may not exist on fresh installs */ }

  // Migration: create viva_score_overrides table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS viva_score_overrides (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL,
      speciality_id INTEGER REFERENCES specialities(id),
      override_score REAL NOT NULL,
      override_reason TEXT,
      overridden_by INTEGER NOT NULL REFERENCES users(id),
      overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(candidate_id, speciality_id)
    )
  `);

  // Migration: panel_queue table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS panel_queue (
      id SERIAL PRIMARY KEY,
      panel_id INTEGER NOT NULL REFERENCES interview_panels(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      queue_position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'waiting',
      called_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(panel_id, candidate_id)
    )
  `);

  // Migration: doctor_panel_status table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS doctor_panel_status (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      is_engaged BOOLEAN NOT NULL DEFAULT FALSE,
      engaged_since TIMESTAMPTZ,
      current_candidate_id INTEGER REFERENCES candidates(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Migration: batches and batch_candidates (Non-destructive update)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS batches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      segment TEXT,
      date TIMESTAMPTZ NOT NULL,
      timing TEXT NOT NULL,
      venue TEXT NOT NULL DEFAULT 'SEH, Bangalore',
      program_id INTEGER NOT NULL REFERENCES programs(id),
      mcq_total_marks REAL NOT NULL DEFAULT 50,
      psychometric_total_marks REAL NOT NULL DEFAULT 50,
      interview_total_marks REAL NOT NULL DEFAULT 100,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS batch_candidates (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      mcq_score REAL,
      psychometric_score REAL,
      interview_score REAL,
      status TEXT NOT NULL DEFAULT 'assigned',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(batch_id, candidate_id)
    )
  `);

  // Ensure is_mock column exists for batches (if table already existed)
  await db.execute(sql`ALTER TABLE batches ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE batches ADD COLUMN IF NOT EXISTS program_id INTEGER DEFAULT 1`);
  await db.execute(sql`ALTER TABLE batches ADD COLUMN IF NOT EXISTS mcq_total_marks REAL NOT NULL DEFAULT 50`);
  await db.execute(sql`ALTER TABLE batches ADD COLUMN IF NOT EXISTS psychometric_total_marks REAL NOT NULL DEFAULT 50`);
  await db.execute(sql`ALTER TABLE batches ADD COLUMN IF NOT EXISTS interview_total_marks REAL NOT NULL DEFAULT 100`);

  await db.execute(sql`ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS mcq_score REAL`);
  await db.execute(sql`ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS psychometric_score REAL`);
  await db.execute(sql`ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS interview_score REAL`);
  await db.execute(sql`ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS speciality_id INTEGER`);

  // Virtual Mock Mode support columns
  await db.execute(sql`ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE interview_panels ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE`);

  // Performance Indexes (Non-blocking & Defensive)
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_lower_email ON candidates (LOWER(email))`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_app_sub_lower_email ON application_submissions (LOWER(email))`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cand_pref_cand_spec ON candidate_preferences (candidate_id, speciality_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_interview_scores_cand_spec ON interview_scores (candidate_id, speciality_id, doctor_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_panel_queue_panel_status ON panel_queue (panel_id, status, queue_position)`);
  } catch (err) {
    logger.warn({ err }, "Index creation notice (already exists or non-critical)");
  }

  // Doctor Marks & Score History Audit Log Table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interview_scores_audit (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      speciality_id INTEGER REFERENCES specialities(id),
      doctor_id INTEGER REFERENCES users(id),
      old_score REAL,
      new_score REAL,
      remarks TEXT,
      action TEXT NOT NULL DEFAULT 'UPDATE',
      changed_by_user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_scores_audit_cand ON interview_scores_audit (candidate_id)`);
  } catch (_) {}

  // Fix 1: correct old placeholder email → canonical super admin email + password
  const [oldEmail] = await db.select().from(usersTable).where(eq(usersTable.email, "admin@sankaraeye.com"));
  if (oldEmail) {
    await db.update(usersTable)
      .set({ email: "saravanan@sankaraeye.com", passwordHash: SARAVANAN_PASSWORD_HASH })
      .where(eq(usersTable.id, oldEmail.id));
    logger.info("Corrected super admin email + password (admin@ → saravanan@)");
  }

  // Fix 2: ensure password hash is correct even if email was already updated
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, "saravanan@sankaraeye.com"));
  if (existing) {
    if (existing.passwordHash !== SARAVANAN_PASSWORD_HASH) {
      await db.update(usersTable)
        .set({ passwordHash: SARAVANAN_PASSWORD_HASH })
        .where(eq(usersTable.id, existing.id));
      logger.info("Corrected super admin password hash for saravanan@sankaraeye.com");
    }
  } else {
    // Fix 3: Create the user if they don't exist at all
    await db.insert(usersTable).values({
      email: "saravanan@sankaraeye.com",
      passwordHash: SARAVANAN_PASSWORD_HASH,
      role: "super_admin",
      fullName: "Saravanan",
    } as any);
    logger.info("Created super admin saravanan@sankaraeye.com");
  }

  // Fix 4: Ensure the July 2026 Fellowship Program and Form exist
  let [prog] = await db.select().from(programsTable).where(ilike(programsTable.name, "%July 2026%"));
  
  if (!prog) {
    [prog] = await db.insert(programsTable).values({
      name: "Fellowship Program July 2026",
      code: "FP-JUL-2026",
      academicYear: "2026",
      category: "fellowship",
      description: "Sankara Academy of Vision Fellowship Intake July 2026"
    }).returning();
    logger.info("Created missing July 2026 fellowship program");
  }

  // Ensure Vision Care Technician (VCT) Program exists as a strictly segregated program
  let [vctProg] = await db.select().from(programsTable).where(or(ilike(programsTable.name, "%VCT%"), ilike(programsTable.name, "%Vision Care%")));
  if (!vctProg) {
    [vctProg] = await db.insert(programsTable).values({
      name: "Vision Care Technician (VCT) Program 2026",
      code: "VCT-2026",
      academicYear: "2026",
      category: "vct",
      description: "Sankara Academy of Vision Care Technician (VCT) Admissions 2026",
      requiresApplicationForm: true,
      requiresTheoryExam: true,
      requiresInterviewViva: true,
      requiresPsychometry: false,
    }).returning();
    logger.info("Created missing VCT 2026 program");
  }

  const [targetForm] = await db.select().from(applicationFormsTable).where(ilike(applicationFormsTable.title, "%July 2026%"));
  
  if (targetForm) {
    await db.update(applicationFormsTable)
      .set({ sectionsConfig: DEFAULT_SECTIONS as any })
      .where(eq(applicationFormsTable.id, targetForm.id));
    logger.info("Updated existing July 2026 fellowship form configuration");
  } else {
    // Create it using the program we found or created
    await db.insert(applicationFormsTable).values({
      programId: prog.id,
      title: "Fellowship Program - July 2026",
      description: "Sankara Academy of Vision Fellowship Program for July 2026 batch.",
      isActive: true,
      token: "JULY2026",
      sectionsConfig: DEFAULT_SECTIONS as any,
    });
    logger.info("Created new July 2026 fellowship form with standard sections");
  }

  // --- HEALING MIGRATION FOR OLD/EXISTING CANDIDATES ---
  try {
    const existingCands = await db.select().from(candidatesTable);
    const allSubmissions = await db.select().from(applicationSubmissionsTable);
    const specialities = await db.select().from(specialitiesTable);
    const preferences = await db.select().from(candidatePreferencesTable);

    logger.info(`Running candidates database compatibility healing migration for ${existingCands.length} candidates...`);

    let healedCount = 0;
    for (const cand of existingCands) {
      // Only heal candidates in active statuses
      const isActiveStatus = ["approved", "waitlisted", "allocated", "interview_completed"].includes(cand.status);
      if (!isActiveStatus) continue;

      // Determine specializations
      let candSpecs: typeof specialities = [];

      // 1. Try from candidatePreferences
      const candPrefs = preferences.filter(p => p.candidateId === cand.id);
      if (candPrefs.length > 0) {
        candSpecs = candPrefs
          .map(p => specialities.find(s => s.id === p.specialityId))
          .filter(Boolean) as typeof specialities;
      }

      // 2. Try from submissions specialization field
      if (candSpecs.length === 0) {
        const sub = allSubmissions.find(s => s.email?.toLowerCase().trim() === cand.email?.toLowerCase().trim());
        if (sub && sub.specialization) {
          const specNames = parseSpecializationString(sub.specialization);
          candSpecs = specNames
            .map(name => specialities.find(s => s.name.toLowerCase().trim() === name.toLowerCase().trim()))
            .filter(Boolean) as typeof specialities;
        }
      }

      // 3. Fallback to first available speciality in database if completely empty
      if (candSpecs.length === 0 && specialities.length > 0) {
        candSpecs = [specialities[0]];
      }

      // Ensure an application row exists for each resolved speciality
      for (const spec of candSpecs) {
        const existingApp = await db.select().from(applicationsTable).where(
          and(
            eq(applicationsTable.candidateId, cand.id),
            eq(applicationsTable.specialityId, spec.id)
          )
        );

        if (existingApp.length === 0) {
          const prefix = spec.code ? spec.code.toUpperCase() : "GEN";
          const year = 2026;
          const countResult = await db.execute(sql`
            SELECT COUNT(*)::int as count FROM applications WHERE speciality_id = ${spec.id} AND hall_ticket_number IS NOT NULL
          `);
          const seq = Number(countResult.rows[0]?.count ?? 0) + 1;
          const hallTicketNumber = `${prefix}-${year}-${String(seq).padStart(3, "0")}`;

          await db.insert(applicationsTable).values({
            candidateId: cand.id,
            specialityId: spec.id,
            hallTicketNumber,
            status: "approved",
          });
          healedCount++;
          logger.info(`[healed] Created application for Candidate: ${cand.fullName} (${cand.candidateCode}), Spec: ${spec.name}, HT: ${hallTicketNumber}`);
        }
      }
    }
    logger.info(`Candidates database compatibility healing migration completed successfully. Healed ${healedCount} applications.`);
  } catch (err: any) {
    logger.error({ err }, "Candidates database compatibility healing migration failed");
  }

  // --- DYNAMIC SPECIALITIES DEDUPLICATION ---
  try {
    logger.info("Running dynamic specialities deduplication migration...");
    
    // Fetch all specialities
    const specsRes = await db.execute(sql`SELECT id, name, code, program_id FROM specialities`);
    const specs = specsRes.rows as Array<{ id: number; name: string; code: string; program_id: number }>;

    // Canonical names mapping
    const canonicalNames = [
      "Cornea",
      "Glaucoma",
      "IOL Fellowship",
      "Medical Retina",
      "Oculoplasty",
      "Pediatric Ophthalmology",
      "Phaco Refractive",
      "Vitreo Retina"
    ];

    // Find canonical IDs in the DB (lowest ID per name)
    const canonicalMap = new Map<string, number>();
    for (const name of canonicalNames) {
      const foundSpecs = specs.filter(s => s.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (foundSpecs.length > 0) {
        foundSpecs.sort((a, b) => a.id - b.id);
        canonicalMap.set(name.toLowerCase(), foundSpecs[0].id);
      }
    }

    // Map duplicate/old names to canonical IDs
    const mergeMap: Array<{ from: number; to: number }> = [];
    const dupIds: number[] = [];

    const oldNameToCanonical: Record<string, string> = {
      "vitreo-retina": "Vitreo Retina",
      "pediatric retina": "Pediatric Ophthalmology",
      "cornea & anterior segment": "Cornea",
      "refractive surgery": "Phaco Refractive",
      "ocular surface": "Cornea"
    };

    for (const s of specs) {
      const normName = s.name.toLowerCase().trim();
      const canonicalName = oldNameToCanonical[normName];
      
      if (canonicalName) {
        const toId = canonicalMap.get(canonicalName.toLowerCase());
        if (toId && toId !== s.id) {
          mergeMap.push({ from: s.id, to: toId });
          dupIds.push(s.id);
        }
      } else {
        // If it's a duplicate of a canonical name (same name, higher ID)
        const matchedCanonicalName = canonicalNames.find(c => c.toLowerCase() === normName);
        if (matchedCanonicalName) {
          const toId = canonicalMap.get(normName);
          if (toId && toId !== s.id) {
            mergeMap.push({ from: s.id, to: toId });
            dupIds.push(s.id);
          }
        }
      }
    }

    if (mergeMap.length > 0) {
      logger.info(`Found ${mergeMap.length} duplicate/old speciality rows — re-mapping and removing: ${dupIds.join(",")}`);
      
      const fkTables = [
        { table: "candidate_preferences", column: "speciality_id" },
        { table: "applications",          column: "speciality_id" },
        { table: "interview_scores",      column: "speciality_id" },
        { table: "interview_panels",      column: "speciality_id" },
        { table: "doctor_assignments",    column: "speciality_id" },
        { table: "allocations",           column: "speciality_id" },
        { table: "batch_candidates",      column: "speciality_id" },
        { table: "viva_score_overrides",  column: "speciality_id" },
      ];

      for (const { from, to } of mergeMap) {
        for (const { table, column } of fkTables) {
          try {
            // Deduplicate unique tables
            if (table === "candidate_preferences") {
              await db.execute(sql.raw(`
                DELETE FROM candidate_preferences 
                WHERE speciality_id = ${from} 
                AND candidate_id IN (
                  SELECT candidate_id FROM candidate_preferences WHERE speciality_id = ${to}
                )
              `));
            } else if (table === "interview_scores") {
              await db.execute(sql.raw(`
                DELETE FROM interview_scores 
                WHERE speciality_id = ${from} 
                AND (candidate_id, doctor_id) IN (
                  SELECT candidate_id, doctor_id FROM interview_scores WHERE speciality_id = ${to}
                )
              `));
            } else if (table === "doctor_assignments") {
              await db.execute(sql.raw(`
                DELETE FROM doctor_assignments 
                WHERE speciality_id = ${from} 
                AND (candidate_id, doctor_id) IN (
                  SELECT candidate_id, doctor_id FROM doctor_assignments WHERE speciality_id = ${to}
                )
              `));
            } else if (table === "viva_score_overrides") {
              await db.execute(sql.raw(`
                DELETE FROM viva_score_overrides 
                WHERE speciality_id = ${from} 
                AND candidate_id IN (
                  SELECT candidate_id FROM viva_score_overrides WHERE speciality_id = ${to}
                )
              `));
            }

            await db.execute(sql.raw(`UPDATE ${table} SET ${column} = ${to} WHERE ${column} = ${from}`));
          } catch (_) { /* table or column may not exist */ }
        }
      }

      // Normalise seat_matrix_entries text field
      const nameMap: Array<{ old: string; canonical: string }> = [
        { old: "Vitreo-Retina",            canonical: "Vitreo Retina" },
        { old: "Pediatric Retina",         canonical: "Pediatric Ophthalmology" },
        { old: "Cornea & Anterior Segment",canonical: "Cornea" },
        { old: "Refractive Surgery",       canonical: "Phaco Refractive" },
        { old: "Ocular Surface",           canonical: "Cornea" },
      ];
      for (const { old, canonical } of nameMap) {
        await db.execute(sql.raw(`UPDATE seat_matrix_entries SET speciality = '${canonical.replace(/'/g, "''")}' WHERE speciality = '${old.replace(/'/g, "''")}'`));
      }

      // Delete duplicate rows
      await db.execute(sql.raw(`DELETE FROM specialities WHERE id IN (${dupIds.join(",")})`));
      logger.info("Dynamic specialities deduplication complete.");
    } else {
      logger.info("Specialities already deduplicated — no duplicates found.");
    }
  } catch (err: any) {
    logger.error({ err }, "Dynamic specialities deduplication migration failed (non-fatal)");
  }

  // --- DATABASE INDEX OPTIMIZATIONS ---
  try {
    logger.info("Applying database index optimizations...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_interview_scores_candidate_id ON interview_scores(candidate_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_interview_scores_speciality_id ON interview_scores(speciality_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_interview_scores_doctor_id ON interview_scores(doctor_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidate_preferences_candidate_id ON candidate_preferences(candidate_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidate_preferences_speciality_id ON candidate_preferences(speciality_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON applications(candidate_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_applications_speciality_id ON applications(speciality_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_applications_batch_id ON applications(batch_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_unit_id ON candidates(unit_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_program_id ON candidates(program_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_candidate_code ON candidates(candidate_code)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_full_name ON candidates(full_name)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_application_submissions_form_id ON application_submissions(form_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_application_submissions_cand_id ON application_submissions(candidate_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_application_submissions_email ON application_submissions(email)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_application_forms_program_id ON application_forms(program_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_specialities_program_id ON specialities(program_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_interview_panels_program_id ON interview_panels(program_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_interview_scores_cand_spec ON interview_scores(candidate_id, speciality_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_viva_overrides_cand_spec ON viva_score_overrides(candidate_id, speciality_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_seat_matrix_entries_prog_id ON seat_matrix_entries(program_id)`);
    
    logger.info("Database index optimizations applied successfully.");
  } catch (err: any) {
    logger.error({ err }, "Failed to apply database index optimizations");
  }


  // Start periodic active session cleanup job
  setInterval(async () => {
    try {
      const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "session_inactivity_timeout"));
      const timeoutMinutes = setting ? parseInt(setting.value, 10) : 30;
      const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      await db.execute(sql`
        UPDATE user_sessions 
        SET is_active = FALSE 
        WHERE is_active = TRUE AND last_activity_at < ${threshold}
      `);
    } catch (e) {
      logger.error({ err: e }, "Failed to prune inactive sessions");
    }
  }, 5 * 60 * 1000); // run every 5 minutes
}


const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  runStartupFixes().catch((e) => logger.error({ err: e }, "Startup fixes failed"));
});

const gracefulShutdown = (signal: string) => {
  logger.info({ signal }, "Received termination signal, shutting down gracefully...");
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

