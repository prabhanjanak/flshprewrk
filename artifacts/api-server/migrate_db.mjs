import pg from 'pg';

const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  console.log("Connected to PostgreSQL for custom migration...");

  try {
    // 1. Create applications table
    console.log("Creating applications table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "applications" (
        "id" serial PRIMARY KEY NOT NULL,
        "candidate_id" integer NOT NULL,
        "speciality_id" integer NOT NULL,
        "hall_ticket_number" text UNIQUE,
        "status" text DEFAULT 'pending' NOT NULL,
        "batch_id" integer,
        "interview_slot" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 2. Add foreign key constraints to applications table
    console.log("Adding foreign keys to applications...");
    try {
      await client.query(`
        ALTER TABLE "applications" 
        ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" 
        FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE;
      `);
    } catch (e) { console.log("Constraint already exists or skipped:", e.message); }

    try {
      await client.query(`
        ALTER TABLE "applications" 
        ADD CONSTRAINT "applications_speciality_id_specialities_id_fk" 
        FOREIGN KEY ("speciality_id") REFERENCES "specialities"("id");
      `);
    } catch (e) { console.log("Constraint already exists or skipped:", e.message); }

    try {
      await client.query(`
        ALTER TABLE "applications" 
        ADD CONSTRAINT "applications_batch_id_batches_id_fk" 
        FOREIGN KEY ("batch_id") REFERENCES "batches"("id");
      `);
    } catch (e) { console.log("Constraint already exists or skipped:", e.message); }

    // 3. Alter interview_panels
    console.log("Altering interview_panels...");
    try {
      await client.query(`
        ALTER TABLE "interview_panels" ADD COLUMN IF NOT EXISTS "speciality_id" integer;
      `);
      await client.query(`
        ALTER TABLE "interview_panels" 
        ADD CONSTRAINT "interview_panels_speciality_id_specialities_id_fk" 
        FOREIGN KEY ("speciality_id") REFERENCES "specialities"("id");
      `);
    } catch (e) { console.log("Altering panels skipped:", e.message); }

    // 4. Alter batch_candidates
    console.log("Altering batch_candidates...");
    try {
      await client.query(`
        ALTER TABLE "batch_candidates" ADD COLUMN IF NOT EXISTS "speciality_id" integer;
      `);
      await client.query(`
        ALTER TABLE "batch_candidates" 
        ADD CONSTRAINT "batch_candidates_speciality_id_specialities_id_fk" 
        FOREIGN KEY ("speciality_id") REFERENCES "specialities"("id");
      `);
    } catch (e) { console.log("Altering batch candidates skipped:", e.message); }

    // 5. Alter interview_scores
    console.log("Altering interview_scores...");
    try {
      await client.query(`
        ALTER TABLE "interview_scores" ADD COLUMN IF NOT EXISTS "speciality_id" integer;
      `);
      await client.query(`
        ALTER TABLE "interview_scores" 
        ADD CONSTRAINT "interview_scores_speciality_id_specialities_id_fk" 
        FOREIGN KEY ("speciality_id") REFERENCES "specialities"("id");
      `);
    } catch (e) { console.log("Altering interview scores skipped:", e.message); }

    // 6. Alter doctor_assignments
    console.log("Altering doctor_assignments...");
    try {
      await client.query(`
        ALTER TABLE "doctor_assignments" ADD COLUMN IF NOT EXISTS "speciality_id" integer;
      `);
      await client.query(`
        ALTER TABLE "doctor_assignments" 
        ADD CONSTRAINT "doctor_assignments_speciality_id_specialities_id_fk" 
        FOREIGN KEY ("speciality_id") REFERENCES "specialities"("id");
      `);
    } catch (e) { console.log("Altering doctor assignments skipped:", e.message); }

    // 7. Ensure program_id in document_templates
    console.log("Ensuring program_id in document_templates...");
    try {
      await client.query(`
        ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "program_id" integer;
      `);
    } catch (e) { console.log("Altering templates skipped:", e.message); }

    console.log("Database Migration Pushed Successfully!");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

main();
