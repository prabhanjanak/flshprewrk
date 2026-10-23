import { db, usersTable, applicationFormsTable, programsTable, candidatesTable, applicationSubmissionsTable, specialitiesTable, candidatePreferencesTable, applicationsTable, unitsTable, paymentSettingsTable, globalSettingsTable } from "@workspace/db";
import { eq, sql, ilike, and, or, ne } from "drizzle-orm";
import { logger } from "./logger";
import { parseSpecializationString } from "./utils";
import { DEFAULT_SECTIONS } from "./default-sections";

// Canonical super admin password hashes (bcrypt with salt rounds = 10)
export const SARAVANAN_PASSWORD_HASH = "$2b$10$tzKB/Dj.bn.MPCUj5GJQz.V6.ijFrypzqkwSjMW458ni7dCAx0MuS"; // Saravanan@2026
export const PRABHANJAN_PASSWORD_HASH = "$2b$10$tvyctohFaAUQNOxzKEl41OJTpdw6oQkfP.ifNrrDHvN1QNUbuNnMq"; // Prabhanjan@2026
export const RADHIKA_PASSWORD_HASH = "$2b$10$b3rGkezYF6rCQHuAUnzWrOa6Q9N9sPAKaABpRyI.QYhZfJWY4ZtqG";    // Radhika@2026

/**
 * Wait for PostgreSQL to become reachable and accept queries.
 * Essential in Docker Compose where the app container may boot slightly before Postgres finishes initializing.
 */
async function waitForDatabase(maxRetries = 30, delayMs = 2000): Promise<void> {
  logger.info("[DB-BOOTSTRAP] Checking database connection...");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      logger.info(`[DB-BOOTSTRAP] Database connection established successfully on attempt ${attempt}/${maxRetries}.`);
      return;
    } catch (err: any) {
      if (attempt === maxRetries) {
        logger.error({ err }, `[DB-BOOTSTRAP] FATAL: Could not connect to database after ${maxRetries} attempts.`);
        throw new Error(`[DB-BOOTSTRAP] Could not connect to database: ${err.message || err}`);
      }
      logger.warn(`[DB-BOOTSTRAP] Database not ready yet (${err.code || err.message}). Retrying in ${delayMs / 1000}s... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * 1. Install PostgreSQL extensions
 */
async function installExtensions(): Promise<void> {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    logger.info("[DB-BOOTSTRAP] PostgreSQL extensions verified (uuid-ossp, pgcrypto).");
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Notice on CREATE EXTENSION (may require superuser or already installed)");
  }
}

/**
 * 2. Create and update custom ENUM types
 */
async function createEnumTypes(): Promise<void> {
  // Candidate status enum
  try {
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_status') THEN
          CREATE TYPE candidate_status AS ENUM ('pending', 'approved', 'rejected', 'interview_completed', 'waitlisted', 'allocated');
        END IF;
      END $$;
    `);
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Enum candidate_status check notice");
  }

  // User role enum
  try {
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('super_admin', 'program_admin', 'exam_coordinator', 'central_exam_coordinator', 'unit_coordinator', 'doctor', 'student');
        END IF;
      END $$;
    `);
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Enum user_role check notice");
  }

  // Add any missing values to user_role (ALTER TYPE must be executed individually)
  const roles = [
    "super_admin",
    "program_admin",
    "exam_coordinator",
    "central_exam_coordinator",
    "unit_coordinator",
    "doctor",
    "student",
    "display_operator",
  ];

  for (const role of roles) {
    try {
      await db.execute(sql.raw(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS '${role}'`));
    } catch (_) {
      // Role already exists in enum or uncommitted
    }
  }
  logger.info("[DB-BOOTSTRAP] Custom ENUM types (candidate_status, user_role) synchronized.");
}

/**
 * 3. Idempotently create all tables with proper structures
 */
async function createAllTables(): Promise<void> {
  logger.info("[DB-BOOTSTRAP] Ensuring all schema tables exist...");

  // 1. Units
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS units (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      location TEXT,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 2. Programs
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS programs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      academic_year TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'fellowship',
      requires_application_form BOOLEAN NOT NULL DEFAULT TRUE,
      requires_payment BOOLEAN NOT NULL DEFAULT FALSE,
      fee_amount INTEGER NOT NULL DEFAULT 0,
      fee_pricing_model TEXT NOT NULL DEFAULT 'per_specialty',
      requires_psychometry BOOLEAN NOT NULL DEFAULT FALSE,
      requires_theory_exam BOOLEAN NOT NULL DEFAULT TRUE,
      requires_interview_viva BOOLEAN NOT NULL DEFAULT TRUE,
      required_uploads JSONB DEFAULT '["photo"]'::jsonb,
      hall_ticket_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      hall_ticket_released BOOLEAN NOT NULL DEFAULT FALSE,
      hall_ticket_prefix TEXT DEFAULT 'SAV-2026',
      exam_date TEXT,
      exam_venue TEXT,
      exam_instructions TEXT,
      offer_letter_template_id INTEGER,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 3. Users
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salutation TEXT,
      full_name TEXT NOT NULL,
      employee_id TEXT,
      designation TEXT,
      gender TEXT,
      avatar_seed TEXT,
      role user_role NOT NULL DEFAULT 'student',
      unit_id INTEGER REFERENCES units(id),
      program_id INTEGER REFERENCES programs(id),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 4. User Sessions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      device_info TEXT,
      ip_address TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )
  `);

  // 5. Specialities
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS specialities (
      id SERIAL PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES programs(id),
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      seats INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 6. Candidates
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      candidate_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      date_of_birth TEXT,
      gender TEXT,
      qualification TEXT,
      college_name TEXT,
      address TEXT,
      unit_id INTEGER REFERENCES units(id),
      status candidate_status NOT NULL DEFAULT 'pending',
      mcq_score TEXT,
      psychometric_score TEXT,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 7. Candidate Preferences
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS candidate_preferences (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      speciality_id INTEGER NOT NULL REFERENCES specialities(id),
      preference_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 8. Batches
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

  // 9. Applications
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      speciality_id INTEGER NOT NULL REFERENCES specialities(id),
      hall_ticket_number TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      batch_id INTEGER REFERENCES batches(id),
      interview_slot TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 10. Batch Candidates
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS batch_candidates (
      id SERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      speciality_id INTEGER REFERENCES specialities(id),
      mcq_score REAL,
      psychometric_score REAL,
      interview_score REAL,
      status TEXT NOT NULL DEFAULT 'assigned',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT batch_candidates_batch_cand_unq UNIQUE(batch_id, candidate_id)
    )
  `);

  // 11. Exams
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      program_id INTEGER REFERENCES programs(id),
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      total_questions INTEGER NOT NULL DEFAULT 20,
      passing_score REAL,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 12. Questions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      choices TEXT[] NOT NULL,
      correct_index INTEGER NOT NULL,
      explanation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 13. Exam Attempts
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      score REAL,
      max_score REAL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ
    )
  `);

  // 14. Exam Answers
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exam_answers (
      id SERIAL PRIMARY KEY,
      attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_index INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 15. Candidate Exam Assignments
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS candidate_exam_assignments (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 16. Interview Panels
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interview_panels (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      room_number TEXT NOT NULL,
      program_id INTEGER REFERENCES programs(id),
      speciality_id INTEGER REFERENCES specialities(id),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      is_mind_matter BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 17. Interview Panel Members
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interview_panel_members (
      id SERIAL PRIMARY KEY,
      panel_id INTEGER NOT NULL REFERENCES interview_panels(id) ON DELETE CASCADE,
      doctor_id INTEGER NOT NULL REFERENCES users(id),
      is_main BOOLEAN NOT NULL DEFAULT FALSE,
      marks_entry_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      CONSTRAINT interview_panel_members_unq UNIQUE(panel_id, doctor_id)
    )
  `);

  // 18. Panel Queue
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS panel_queue (
      id SERIAL PRIMARY KEY,
      panel_id INTEGER NOT NULL REFERENCES interview_panels(id) ON DELETE CASCADE,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      queue_position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'waiting',
      called_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT panel_queue_unq UNIQUE(panel_id, candidate_id)
    )
  `);

  // 19. Doctor Panel Status
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

  // 20. Doctor Assignments
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS doctor_assignments (
      id SERIAL PRIMARY KEY,
      doctor_id INTEGER NOT NULL REFERENCES users(id),
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      speciality_id INTEGER REFERENCES specialities(id),
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 21. Interview Scores
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS interview_scores (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      doctor_id INTEGER NOT NULL REFERENCES users(id),
      speciality_id INTEGER REFERENCES specialities(id),
      score REAL NOT NULL,
      remarks TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      entered_by INTEGER REFERENCES users(id),
      entered_at TIMESTAMPTZ,
      last_modified_by INTEGER REFERENCES users(id),
      last_modified_at TIMESTAMPTZ
    )
  `);

  // 22. Viva Score Overrides
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS viva_score_overrides (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      speciality_id INTEGER REFERENCES specialities(id),
      override_score REAL NOT NULL,
      override_reason TEXT,
      overridden_by INTEGER NOT NULL REFERENCES users(id),
      overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT viva_score_overrides_unq UNIQUE(candidate_id, speciality_id)
    )
  `);

  // 23. Interview Scores Audit
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

  // 24. Allocations
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS allocations (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      program_id INTEGER NOT NULL REFERENCES programs(id),
      speciality_id INTEGER REFERENCES specialities(id),
      unit_id INTEGER REFERENCES units(id),
      status TEXT NOT NULL DEFAULT 'SELECTED',
      rank INTEGER,
      total_score REAL,
      allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 25. Application Forms
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_forms (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      program_id INTEGER NOT NULL REFERENCES programs(id),
      title TEXT NOT NULL,
      description TEXT,
      deadline TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      custom_fields JSONB DEFAULT '[]'::jsonb,
      sections_config JSONB DEFAULT '[]'::jsonb,
      google_forms_config JSONB DEFAULT NULL,
      google_sheets_config JSONB DEFAULT NULL
    )
  `);

  // 26. Application Submissions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_submissions (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER REFERENCES candidates(id),
      application_id UUID DEFAULT gen_random_uuid() UNIQUE,
      form_id INTEGER NOT NULL REFERENCES application_forms(id),
      save_as_draft BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'pending',
      specialization TEXT,
      center_preference TEXT,
      referral_source TEXT,
      referred_by_name TEXT,
      media_source TEXT,
      full_name TEXT NOT NULL,
      permanent_address TEXT,
      mailing_address TEXT,
      phone TEXT,
      email TEXT NOT NULL,
      gender TEXT,
      date_of_birth TEXT,
      marital_status TEXT,
      spouse_details TEXT,
      health_declaration TEXT,
      health_details TEXT,
      medical_conditions TEXT,
      previous_application_month_year TEXT,
      degree TEXT,
      medical_college TEXT,
      university TEXT,
      pg_qualifications TEXT,
      do_qualification BOOLEAN,
      do_details TEXT,
      ms_md_qualification BOOLEAN,
      ms_md_details TEXT,
      dnb_qualification BOOLEAN,
      dnb_details TEXT,
      other_training TEXT,
      medical_council_number TEXT,
      diagnostic_skills TEXT,
      surgical_experience TEXT,
      total_surgeries TEXT,
      publications TEXT,
      presentations TEXT,
      lor1_url TEXT,
      lor1_ref_name TEXT,
      lor1_ref_contact TEXT,
      lor1_ref_email TEXT,
      lor2_url TEXT,
      lor2_ref_name TEXT,
      lor2_ref_contact TEXT,
      lor2_ref_email TEXT,
      other_information TEXT,
      declaration_accepted BOOLEAN,
      payment_url TEXT,
      photo_url TEXT,
      paid_amount INTEGER,
      payment_id TEXT,
      payment_mode TEXT,
      custom_answers JSONB DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'internal',
      ready_for_review BOOLEAN NOT NULL DEFAULT FALSE,
      google_forms_response_id TEXT,
      google_sheets_row_id TEXT,
      review_notes TEXT,
      form_data JSONB DEFAULT '{}'::jsonb,
      is_mock BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `);

  // 27. Documents
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 28. Document Templates
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS document_templates (
      id SERIAL PRIMARY KEY,
      program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      google_doc_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 29. Seat Matrix Entries
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS seat_matrix_entries (
      id SERIAL PRIMARY KEY,
      program_id INTEGER REFERENCES programs(id),
      speciality TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      total_seats INTEGER NOT NULL DEFAULT 0,
      allocated_seats INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 30. Payment Settings
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_settings (
      id SERIAL PRIMARY KEY,
      program_id INTEGER REFERENCES programs(id),
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

  // 31. Email Settings
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS email_settings (
      id SERIAL PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      host TEXT NOT NULL DEFAULT '',
      port TEXT NOT NULL DEFAULT '587',
      "user" TEXT NOT NULL DEFAULT '',
      pass TEXT NOT NULL DEFAULT '',
      use_ssl BOOLEAN NOT NULL DEFAULT FALSE,
      from_name TEXT NOT NULL DEFAULT 'Sankara Academy of Vision',
      from_email TEXT NOT NULL DEFAULT '',
      google_docs_template_id TEXT,
      google_service_account_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 32. Global Settings
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS global_settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 33. Audit Logs
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 34. Uploaded Files
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_data BYTEA NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  logger.info("[DB-BOOTSTRAP] All 34 tables verified and created if missing.");
}

/**
 * 4. Add missing columns across all tables for existing legacy databases
 */
async function synchronizeColumns(): Promise<void> {
  logger.info("[DB-BOOTSTRAP] Synchronizing table columns (ADD COLUMN IF NOT EXISTS)...");

  const columnMigrations = [
    // users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS salutation TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS designation TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES programs(id)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT FALSE",

    // programs
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'fellowship'",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS requires_application_form BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS fee_amount INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS fee_pricing_model TEXT NOT NULL DEFAULT 'per_specialty'",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS requires_psychometry BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS requires_theory_exam BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS requires_interview_viva BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS required_uploads JSONB DEFAULT '[\"photo\"]'::jsonb",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS hall_ticket_enabled BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS hall_ticket_released BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS hall_ticket_prefix TEXT DEFAULT 'SAV-2026'",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS exam_date TEXT",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS exam_venue TEXT",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS exam_instructions TEXT",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS offer_letter_template_id INTEGER",
    "ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",

    // candidates
    "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
    "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id)",
    "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS mcq_score TEXT",
    "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS psychometric_score TEXT",
    "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",

    // application_forms
    "ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS sections_config JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS google_forms_config JSONB DEFAULT NULL",
    "ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS google_sheets_config JSONB DEFAULT NULL",

    // application_submissions
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS medical_conditions TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor1_url TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor1_ref_name TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor1_ref_contact TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor1_ref_email TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor2_url TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor2_ref_name TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor2_ref_contact TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS lor2_ref_email TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS payment_url TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS photo_url TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS paid_amount INTEGER",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS payment_id TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS payment_mode TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'internal'",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS ready_for_review BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS google_forms_response_id TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS google_sheets_row_id TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS review_notes TEXT",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE application_submissions ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",

    // seat_matrix_entries
    "ALTER TABLE seat_matrix_entries ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES programs(id)",

    // payment_settings
    "ALTER TABLE payment_settings ADD COLUMN IF NOT EXISTS upi_id TEXT",

    // interview_panels
    "ALTER TABLE interview_panels ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES programs(id)",
    "ALTER TABLE interview_panels ADD COLUMN IF NOT EXISTS speciality_id INTEGER REFERENCES specialities(id)",
    "ALTER TABLE interview_panels ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE interview_panels ADD COLUMN IF NOT EXISTS is_mind_matter BOOLEAN NOT NULL DEFAULT FALSE",

    // interview_panel_members
    "ALTER TABLE interview_panel_members ADD COLUMN IF NOT EXISTS marks_entry_enabled BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE interview_panel_members ADD COLUMN IF NOT EXISTS is_main BOOLEAN NOT NULL DEFAULT FALSE",

    // interview_scores
    "ALTER TABLE interview_scores ADD COLUMN IF NOT EXISTS speciality_id INTEGER REFERENCES specialities(id)",
    "ALTER TABLE interview_scores ADD COLUMN IF NOT EXISTS entered_by INTEGER REFERENCES users(id)",
    "ALTER TABLE interview_scores ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ",
    "ALTER TABLE interview_scores ADD COLUMN IF NOT EXISTS last_modified_by INTEGER REFERENCES users(id)",
    "ALTER TABLE interview_scores ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ",

    // batches
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS segment TEXT",
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS venue TEXT NOT NULL DEFAULT 'SEH, Bangalore'",
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS program_id INTEGER NOT NULL DEFAULT 1 REFERENCES programs(id)",
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS mcq_total_marks REAL NOT NULL DEFAULT 50",
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS psychometric_total_marks REAL NOT NULL DEFAULT 50",
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS interview_total_marks REAL NOT NULL DEFAULT 100",
    "ALTER TABLE batches ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",

    // batch_candidates
    "ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS speciality_id INTEGER REFERENCES specialities(id)",
    "ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS mcq_score REAL",
    "ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS psychometric_score REAL",
    "ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS interview_score REAL",
    "ALTER TABLE batch_candidates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'assigned'",

    // exams
    "ALTER TABLE exams ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES programs(id)",
    "ALTER TABLE exams ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ",
    "ALTER TABLE exams ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ",
    "ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",

    // units
    "ALTER TABLE units ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT FALSE",
  ];

  for (const query of columnMigrations) {
    try {
      await db.execute(sql.raw(query));
    } catch (err: any) {
      logger.warn({ err }, `[DB-BOOTSTRAP] Notice on query: ${query}`);
    }
  }

  logger.info("[DB-BOOTSTRAP] Table columns synchronized successfully.");
}

/**
 * 5. Heal conflicting legacy constraints and establish performance indexes
 */
async function healConstraintsAndIndexes(): Promise<void> {
  logger.info("[DB-BOOTSTRAP] Healing legacy constraints and building indexes...");

  // Drop old marks entry constraint that restricted only 1 enabled doctor per panel
  try {
    await db.execute(sql`DROP INDEX IF EXISTS panel_marks_entry_unq`);
  } catch (_) {}

  // Seat matrix entries constraint rework
  try {
    await db.execute(sql`ALTER TABLE seat_matrix_entries DROP CONSTRAINT IF EXISTS seat_matrix_entries_speciality_unit_name_key`);
    await db.execute(sql`ALTER TABLE seat_matrix_entries DROP CONSTRAINT IF EXISTS seat_matrix_entries_speciality_key`);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seat_matrix_entries_prog_spec_unit_key') THEN
          ALTER TABLE seat_matrix_entries ADD CONSTRAINT seat_matrix_entries_prog_spec_unit_key UNIQUE (program_id, speciality, unit_name);
        END IF;
      END $$;
    `);
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Notice on seat_matrix_entries constraint update");
  }

  // Performance indexes
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_candidates_lower_email ON candidates (LOWER(email))",
    "CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status)",
    "CREATE INDEX IF NOT EXISTS idx_candidates_unit_id ON candidates(unit_id)",
    "CREATE INDEX IF NOT EXISTS idx_candidates_candidate_code ON candidates(candidate_code)",
    "CREATE INDEX IF NOT EXISTS idx_candidates_full_name ON candidates(full_name)",

    "CREATE INDEX IF NOT EXISTS idx_app_sub_lower_email ON application_submissions (LOWER(email))",
    "CREATE INDEX IF NOT EXISTS idx_application_submissions_form_id ON application_submissions(form_id)",
    "CREATE INDEX IF NOT EXISTS idx_application_submissions_cand_id ON application_submissions(candidate_id)",

    "CREATE INDEX IF NOT EXISTS idx_cand_pref_cand_spec ON candidate_preferences (candidate_id, speciality_id)",
    "CREATE INDEX IF NOT EXISTS idx_candidate_preferences_candidate_id ON candidate_preferences(candidate_id)",
    "CREATE INDEX IF NOT EXISTS idx_candidate_preferences_speciality_id ON candidate_preferences(speciality_id)",

    "CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON applications(candidate_id)",
    "CREATE INDEX IF NOT EXISTS idx_applications_speciality_id ON applications(speciality_id)",
    "CREATE INDEX IF NOT EXISTS idx_applications_batch_id ON applications(batch_id)",

    "CREATE INDEX IF NOT EXISTS idx_interview_scores_candidate_id ON interview_scores(candidate_id)",
    "CREATE INDEX IF NOT EXISTS idx_interview_scores_speciality_id ON interview_scores(speciality_id)",
    "CREATE INDEX IF NOT EXISTS idx_interview_scores_doctor_id ON interview_scores(doctor_id)",
    "CREATE INDEX IF NOT EXISTS idx_interview_scores_cand_spec ON interview_scores (candidate_id, speciality_id, doctor_id)",

    "CREATE INDEX IF NOT EXISTS idx_panel_queue_panel_status ON panel_queue (panel_id, status, queue_position)",
    "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token)",

    "CREATE INDEX IF NOT EXISTS idx_scores_audit_cand ON interview_scores_audit (candidate_id)",
    "CREATE INDEX IF NOT EXISTS idx_viva_overrides_cand_spec ON viva_score_overrides(candidate_id, speciality_id)",
    "CREATE INDEX IF NOT EXISTS idx_seat_matrix_entries_prog_id ON seat_matrix_entries(program_id)",
  ];

  for (const idxQuery of indexes) {
    try {
      await db.execute(sql.raw(idxQuery));
    } catch (_) {}
  }

  logger.info("[DB-BOOTSTRAP] Constraints healed and performance indexes ready.");
}

/**
 * 6. Baseline data seeding and state rework
 */
async function seedAndHealBaselineData(): Promise<void> {
  logger.info("[DB-BOOTSTRAP] Seeding canonical administrators and baseline programs...");

  // Fix old placeholder email if present
  try {
    const [oldEmail] = await db.select().from(usersTable).where(eq(usersTable.email, "admin@sankaraeye.com"));
    if (oldEmail) {
      await db.update(usersTable)
        .set({ email: "saravanan@sankaraeye.com", passwordHash: SARAVANAN_PASSWORD_HASH })
        .where(eq(usersTable.id, oldEmail.id));
      logger.info("[DB-BOOTSTRAP] Corrected legacy admin email: admin@ → saravanan@sankaraeye.com");
    }
  } catch (_) {}

  // Ensure Canonical Super Admins exist with correct roles & password hashes
  const canonicalSuperAdmins = [
    { email: "saravanan@sankaraeye.com", fullName: "Saravanan", hash: SARAVANAN_PASSWORD_HASH },
    { email: "prabhanjan@sankaraeye.com", fullName: "Prabhanjan", hash: PRABHANJAN_PASSWORD_HASH },
    { email: "radhika@sankaraeye.com", fullName: "Radhika Saranam", hash: RADHIKA_PASSWORD_HASH },
  ];

  for (const admin of canonicalSuperAdmins) {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, admin.email));
    if (existing) {
      if (existing.role !== "super_admin" || existing.passwordHash !== admin.hash || !existing.active) {
        await db.update(usersTable)
          .set({ role: "super_admin", passwordHash: admin.hash, active: true, forcePasswordReset: false })
          .where(eq(usersTable.id, existing.id));
        logger.info(`[DB-BOOTSTRAP] Updated super admin credentials/role for ${admin.email}`);
      }
    } else {
      await db.insert(usersTable).values({
        email: admin.email,
        passwordHash: admin.hash,
        role: "super_admin",
        fullName: admin.fullName,
        active: true,
        forcePasswordReset: false,
      } as any);
      logger.info(`[DB-BOOTSTRAP] Created super admin ${admin.email}`);
    }
  }

  // Base Units (All 13 official units)
  const baseUnits = [
    { name: "Anand", city: "Anand", location: "Anand, Gujarat" },
    { name: "Bangalore", city: "Bangalore", location: "Kundanahalli, Bangalore, Karnataka" },
    { name: "Coimbatore", city: "Coimbatore", location: "Sivanandapuram, Coimbatore, Tamil Nadu" },
    { name: "Guntur", city: "Guntur", location: "Guntur, Andhra Pradesh" },
    { name: "Hyderabad", city: "Hyderabad", location: "Hyderabad, Telangana" },
    { name: "Indore", city: "Indore", location: "Indore, Madhya Pradesh" },
    { name: "Jaipur", city: "Jaipur", location: "Jaipur, Rajasthan" },
    { name: "Kanpur", city: "Kanpur", location: "Kanpur, Uttar Pradesh" },
    { name: "Krishnankoil", city: "Krishnankoil", location: "Krishnankoil, Tamil Nadu" },
    { name: "Ludhiana", city: "Ludhiana", location: "Ludhiana, Punjab" },
    { name: "Panvel", city: "Panvel", location: "Panvel, Maharashtra" },
    { name: "Shimoga", city: "Shimoga", location: "Shimoga, Karnataka" },
    { name: "Varanasi", city: "Varanasi", location: "Varanasi, Uttar Pradesh" },
  ];

  for (const unit of baseUnits) {
    const [exists] = await db.select().from(unitsTable).where(ilike(unitsTable.name, unit.name));
    if (!exists) {
      await db.insert(unitsTable).values(unit);
      logger.info(`[DB-BOOTSTRAP] Provisioned baseline unit: ${unit.name}`);
    }
  }

  // --- PROGRAM 1: Fellowship January 2027 (Current Active Admissions) ---
  let [jan27Prog] = await db.select().from(programsTable).where(
    or(
      ilike(programsTable.code, "FP-JAN-2027"),
      ilike(programsTable.name, "%January 2027%"),
      ilike(programsTable.name, "%Jan 2027%"),
      ilike(programsTable.name, "%Jan-27%")
    )
  );

  if (!jan27Prog) {
    [jan27Prog] = await db.insert(programsTable).values({
      name: "Fellowship Program January 2027",
      code: "FP-JAN-2027",
      academicYear: "2027",
      category: "fellowship",
      description: "Sankara Academy of Vision Fellowship Intake January 2027",
      requiresApplicationForm: true,
      requiresPayment: true,
      feeAmount: 2750,
      feePricingModel: "per_specialty",
      requiresTheoryExam: true,
      requiresInterviewViva: true,
      requiresPsychometry: false,
      hallTicketEnabled: true,
      hallTicketPrefix: "SAV-JAN27",
      examDate: "07.12.2026 (Retina) & 08.12.2026 (Anterior Segment)",
      examVenue: "Sankara Eye Hospital, Bengaluru",
      examInstructions: "Retina Fellowship Entrance: 07.12.2026 | Anterior Segment Fellowship Entrance: 08.12.2026 | Induction: 07.01.2027 & 08.01.2027 | Reporting: 11.01.2027",
    }).returning();
    logger.info("[DB-BOOTSTRAP] Provisioned Fellowship Program January 2027 (FP-JAN-2027)");
  }

  // Specialities for Jan 2027 (Total 65 Seats)
  const jan27Specialities = [
    { name: "Cornea", code: "COR", seats: 6 },
    { name: "Glaucoma", code: "GLA", seats: 5 },
    { name: "IOL Fellowship", code: "IOL", seats: 31 },
    { name: "Medical Retina", code: "MR", seats: 9 },
    { name: "Oculoplasty", code: "OP", seats: 3 },
    { name: "Pediatric Ophthalmology", code: "PED", seats: 4 },
    { name: "Phaco Refractive", code: "PR", seats: 2 },
    { name: "Vitreo Retina", code: "VR", seats: 5 },
  ];

  for (const spec of jan27Specialities) {
    const [existing] = await db.select().from(specialitiesTable).where(
      and(
        eq(specialitiesTable.programId, jan27Prog.id),
        ilike(specialitiesTable.name, spec.name)
      )
    );
    if (!existing) {
      await db.insert(specialitiesTable).values({
        programId: jan27Prog.id,
        name: spec.name,
        code: spec.code,
        seats: spec.seats,
      });
    } else {
      await db.update(specialitiesTable)
        .set({ seats: spec.seats })
        .where(eq(specialitiesTable.id, existing.id));
    }
  }

  // Seat Matrix for Jan 2027 (Verified exact 65 seats from official intake chart)
  const JAN27_MATRIX: Record<string, Record<string, number>> = {
    "Cornea":                  { Bangalore: 1, Coimbatore: 3, Guntur: 1, Shimoga: 1 },
    "Glaucoma":                { Bangalore: 1, Coimbatore: 1, Guntur: 2, Shimoga: 1 },
    "IOL Fellowship":          { Anand: 1, Coimbatore: 2, Guntur: 2, Hyderabad: 2, Indore: 3, Jaipur: 3, Kanpur: 4, Krishnankoil: 4, Ludhiana: 4, Panvel: 2, Shimoga: 1, Varanasi: 3 },
    "Medical Retina":          { Bangalore: 1, Coimbatore: 2, Guntur: 3, Indore: 1, Shimoga: 2 },
    "Oculoplasty":             { Coimbatore: 1, Guntur: 1, Varanasi: 1 },
    "Pediatric Ophthalmology": { Bangalore: 1, Coimbatore: 1, Guntur: 1, Shimoga: 1 },
    "Phaco Refractive":        { Bangalore: 1, Coimbatore: 1 },
    "Vitreo Retina":           { Bangalore: 2, Coimbatore: 1, Guntur: 1, Shimoga: 1 },
  };

  const ALL_UNITS = [
    "Anand", "Bangalore", "Coimbatore", "Guntur", "Hyderabad",
    "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana",
    "Panvel", "Shimoga", "Varanasi",
  ];

  for (const [speciality, unitSeats] of Object.entries(JAN27_MATRIX)) {
    for (const unit of ALL_UNITS) {
      const seats = unitSeats[unit] ?? 0;
      await db.execute(sql`
        INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
        VALUES (${jan27Prog.id}, ${speciality}, ${unit}, ${seats}, 0)
        ON CONFLICT (program_id, speciality, unit_name) DO UPDATE
          SET total_seats = ${seats}, updated_at = NOW()
      `);
    }
  }
  logger.info("[DB-BOOTSTRAP] Provisioned and synchronized official Jan-27 seat matrix (65 seats across 13 units).");

  // Application Form for January intake (token: JAN2027)
  const [janForm] = await db.select().from(applicationFormsTable).where(
    or(
      eq(applicationFormsTable.token, "JAN2027"),
      eq(applicationFormsTable.token, "JAN2026"),
      ilike(applicationFormsTable.title, "%January 2027%"),
      ilike(applicationFormsTable.title, "%January 2026%"),
      ilike(applicationFormsTable.title, "%Jan 2027%"),
      ilike(applicationFormsTable.title, "%Jan 2026%")
    )
  );

  if (janForm) {
    await db.update(applicationFormsTable)
      .set({
        token: "JAN2027",
        programId: jan27Prog.id,
        title: "Fellowship Program - January 2027 (Entrance Exam: December 2026)",
        description: "Sankara Academy of Vision Fellowship Program for January 2027 intake (Entrance Examination: 07.12.2026 & 08.12.2026).",
        isActive: true,
        sectionsConfig: DEFAULT_SECTIONS as any,
      })
      .where(eq(applicationFormsTable.id, janForm.id));
    logger.info("[DB-BOOTSTRAP] Synchronized active application form for January intake (token: JAN2027).");
  } else {
    await db.insert(applicationFormsTable).values({
      programId: jan27Prog.id,
      title: "Fellowship Program - January 2027 (Entrance Exam: December 2026)",
      description: "Sankara Academy of Vision Fellowship Program for January 2027 intake (Entrance Examination: 07.12.2026 & 08.12.2026).",
      isActive: true,
      token: "JAN2027",
      sectionsConfig: DEFAULT_SECTIONS as any,
    });
    logger.info("[DB-BOOTSTRAP] Created new application form for January intake (token: JAN2027).");
  }

  // Payment Settings for Jan 2027
  const [jan27Payment] = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.programId, jan27Prog.id));
  const defaultKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || "rzp_live_ddDz3Yp0860GqG";
  const defaultSecret = process.env.RAZORPAY_KEY_SECRET || "LGVG9K6XjOwpHnfjfGMmgwxZ";

  if (!jan27Payment) {
    await db.insert(paymentSettingsTable).values({
      programId: jan27Prog.id,
      amount: 275000,
      currency: "INR",
      description: "Fellowship Application Fee January 2027",
      mode: "live",
      razorpayKeyId: defaultKeyId,
      razorpayKeySecret: defaultSecret,
      isActive: true,
    });
    logger.info("[DB-BOOTSTRAP] Provisioned default LIVE payment settings for January 2027 with Razorpay configuration");
  } else {
    await db.update(paymentSettingsTable)
      .set({
        mode: "live",
        razorpayKeyId: defaultKeyId,
        razorpayKeySecret: defaultSecret,
        updatedAt: new Date(),
      })
      .where(eq(paymentSettingsTable.id, jan27Payment.id));
    logger.info("[DB-BOOTSTRAP] Synchronized January 2027 payment settings with default LIVE Razorpay credentials");
  }

  // Ensure any other active payment settings are also synchronized with live credentials
  await db.update(paymentSettingsTable)
    .set({
      mode: "live",
      razorpayKeyId: defaultKeyId,
      razorpayKeySecret: defaultSecret,
      updatedAt: new Date(),
    })
    .where(eq(paymentSettingsTable.isActive, true));

  // Ensure ONLY Fellowship Program January 2027 is active and purge all legacy, mock, or obsolete programs
  try {
    // Purge any application forms that do not belong to the Jan 2027 program
    await db.delete(applicationFormsTable).where(
      and(
        ne(applicationFormsTable.token, "JAN2027"),
        ne(applicationFormsTable.programId, jan27Prog.id)
      )
    );

    // Purge all programs other than January 2027
    const oldPrograms = await db.select().from(programsTable).where(
      and(
        ne(programsTable.id, jan27Prog.id),
        ne(programsTable.code, "FP-JAN-2027")
      )
    );
    for (const op of oldPrograms) {
      await db.execute(sql`DELETE FROM seat_matrix_entries WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM specialities WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM payment_settings WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM application_forms WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM document_templates WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM interview_panels WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM allocations WHERE program_id = ${op.id}`);
      await db.execute(sql`DELETE FROM programs WHERE id = ${op.id}`);
      logger.info(`[DB-BOOTSTRAP] Permanently purged non-Jan2027 program: ${op.name} (${op.code})`);
    }
    logger.info("[DB-BOOTSTRAP] Verified ONLY Fellowship Program January 2027 exists in database.");
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Notice on non-Jan2027 program purge");
  }

  // Global Settings Defaults
  const [mockSetting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "mock_mode"));
  if (!mockSetting) {
    await db.insert(globalSettingsTable).values({ key: "mock_mode", value: "false" });
  } else if (mockSetting.value === "true") {
    await db.update(globalSettingsTable).set({ value: "false" }).where(eq(globalSettingsTable.id, mockSetting.id));
  }

  const [timeoutSetting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "session_inactivity_timeout"));
  if (!timeoutSetting) {
    await db.insert(globalSettingsTable).values({ key: "session_inactivity_timeout", value: "30" });
  }

  // Candidate Data Compatibility Healing
  try {
    const existingCands = await db.select().from(candidatesTable);
    const allSubmissions = await db.select().from(applicationSubmissionsTable);
    const specialities = await db.select().from(specialitiesTable);
    const preferences = await db.select().from(candidatePreferencesTable);

    let healedCount = 0;
    for (const cand of existingCands) {
      const isActiveStatus = ["approved", "waitlisted", "allocated", "interview_completed"].includes(cand.status);
      if (!isActiveStatus) continue;

      let candSpecs: typeof specialities = [];
      const candPrefs = preferences.filter((p) => p.candidateId === cand.id);
      if (candPrefs.length > 0) {
        candSpecs = candPrefs
          .map((p) => specialities.find((s) => s.id === p.specialityId))
          .filter(Boolean) as typeof specialities;
      }

      if (candSpecs.length === 0) {
        const sub = allSubmissions.find((s) => s.email?.toLowerCase().trim() === cand.email?.toLowerCase().trim());
        if (sub && sub.specialization) {
          const specNames = parseSpecializationString(sub.specialization);
          candSpecs = specNames
            .map((name) => specialities.find((s) => s.name.toLowerCase().trim() === name.toLowerCase().trim()))
            .filter(Boolean) as typeof specialities;
        }
      }

      if (candSpecs.length === 0 && specialities.length > 0) {
        candSpecs = [specialities[0]];
      }

      for (const spec of candSpecs) {
        const existingApp = await db.select().from(applicationsTable).where(
          and(
            eq(applicationsTable.candidateId, cand.id),
            eq(applicationsTable.specialityId, spec.id)
          )
        );

        if (existingApp.length === 0) {
          const prefix = spec.code ? spec.code.toUpperCase() : "GEN";
          const countResult = await db.execute(sql`
            SELECT COUNT(*)::int as count FROM applications WHERE speciality_id = ${spec.id} AND hall_ticket_number IS NOT NULL
          `);
          const seq = Number(countResult.rows[0]?.count ?? 0) + 1;
          const hallTicketNumber = `${prefix}-2026-${String(seq).padStart(3, "0")}`;

          await db.insert(applicationsTable).values({
            candidateId: cand.id,
            specialityId: spec.id,
            hallTicketNumber,
            status: "approved",
          });
          healedCount++;
        }
      }
    }
    if (healedCount > 0) {
      logger.info(`[DB-BOOTSTRAP] Healed ${healedCount} candidate applications with valid hall tickets.`);
    }
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Non-fatal candidate healing notice");
  }

  // Dynamic Specialities Deduplication
  try {
    const specsRes = await db.execute(sql`SELECT id, name, code, program_id FROM specialities`);
    const specs = specsRes.rows as Array<{ id: number; name: string; code: string; program_id: number }>;

    const canonicalNames = [
      "Cornea",
      "Glaucoma",
      "Cataract & IOL",
      "Medical Retina",
      "Orbit & Oculoplasty",
      "Pediatric Ophthalmology",
      "Phaco Refractive",
      "Vitreo Retina",
      "Comprehensive Ophthalmology"
    ];

    const canonicalMap = new Map<string, number>();
    for (const name of canonicalNames) {
      const foundSpecs = specs.filter((s) => s.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (foundSpecs.length > 0) {
        foundSpecs.sort((a, b) => a.id - b.id);
        canonicalMap.set(name.toLowerCase(), foundSpecs[0].id);
      }
    }

    const mergeMap: Array<{ from: number; to: number }> = [];
    const dupIds: number[] = [];

    const oldNameToCanonical: Record<string, string> = {
      "vitreo-retina": "Vitreo Retina",
      "pediatric retina": "Pediatric Ophthalmology",
      "cornea & anterior segment": "Cornea",
      "refractive surgery": "Phaco Refractive",
      "ocular surface": "Cornea",
      "iol fellowship": "Cataract & IOL",
      "oculoplasty": "Orbit & Oculoplasty"
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
        const matchedCanonicalName = canonicalNames.find((c) => c.toLowerCase() === normName);
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
      logger.info(`[DB-BOOTSTRAP] Found ${mergeMap.length} duplicate/old speciality rows — re-mapping...`);
      const fkTables = [
        { table: "candidate_preferences", column: "speciality_id" },
        { table: "applications", column: "speciality_id" },
        { table: "interview_scores", column: "speciality_id" },
        { table: "interview_panels", column: "speciality_id" },
        { table: "doctor_assignments", column: "speciality_id" },
        { table: "allocations", column: "speciality_id" },
        { table: "batch_candidates", column: "speciality_id" },
        { table: "viva_score_overrides", column: "speciality_id" },
      ];

      for (const { from, to } of mergeMap) {
        for (const { table, column } of fkTables) {
          try {
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
          } catch (_) {}
        }
      }

      await db.execute(sql.raw(`DELETE FROM specialities WHERE id IN (${dupIds.join(",")})`));
      logger.info("[DB-BOOTSTRAP] Specialities deduplication complete.");
    }
  } catch (err: any) {
    logger.warn({ err }, "[DB-BOOTSTRAP] Specialities deduplication notice (non-fatal)");
  }

  logger.info("[DB-BOOTSTRAP] Baseline data seeding and state rework completed.");
}

/**
 * Master Database Overhaul & Bootstrap Runner
 * Automatically called upon application startup before HTTP traffic begins.
 */
export async function bootstrapDatabase(): Promise<void> {
  const startTime = Date.now();
  logger.info("==================================================================");
  logger.info("🚀 SANKARA ACADEMY OF VISION — AUTOMATIC DATABASE BOOTSTRAP 🚀");
  logger.info("==================================================================");

  // Step 1: Wait for database connection with retries
  await waitForDatabase(30, 2000);

  // Step 2: Install required Postgres extensions
  await installExtensions();

  // Step 3: Create and update custom ENUMs
  await createEnumTypes();

  // Step 4: Create all tables (CREATE TABLE IF NOT EXISTS)
  await createAllTables();

  // Step 5: Synchronize all columns across all tables (ADD COLUMN IF NOT EXISTS)
  await synchronizeColumns();

  // Step 6: Heal constraints and build performance indexes
  await healConstraintsAndIndexes();

  // Step 7: Seed baseline data and heal legacy candidate state
  await seedAndHealBaselineData();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info("==================================================================");
  logger.info(`✅ DATABASE REWORK & BOOTSTRAP COMPLETE IN ${elapsed}s`);
  logger.info("==================================================================");
}
