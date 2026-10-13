import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking candidate Lavanya G in database...");
  const cRes = await db.execute(sql`
    SELECT id, "full_name", email, status 
    FROM candidates 
    WHERE "full_name" ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  console.log("Candidates found:", cRes.rows);

  for (const cand of cRes.rows) {
    const prefs = await db.execute(sql`
      SELECT cp.*, s.name as spec_name 
      FROM candidate_preferences cp
      JOIN specialities s ON s.id = cp.speciality_id
      WHERE cp.candidate_id = ${cand.id}
    `);
    console.log(`Preferences for Candidate ID ${cand.id}:`, prefs.rows);
  }

  const subRes = await db.execute(sql`
    SELECT id, "full_name", email, status, specialization, paid_amount, payment_id, payment_mode
    FROM application_submissions 
    WHERE "full_name" ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  console.log("Submissions found:", subRes.rows);
}

main().catch(console.error);
