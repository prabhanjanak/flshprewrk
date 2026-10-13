import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Connected to local database. Checking Lavanya G...");
  
  const cRes = await client.query(`
    SELECT id, full_name, email, status, candidate_code 
    FROM candidates 
    WHERE full_name ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  console.log("Candidates found in candidates table:", cRes.rows);

  for (const cand of cRes.rows) {
    const prefs = await client.query(`
      SELECT cp.*, s.name as spec_name 
      FROM candidate_preferences cp
      JOIN specialities s ON s.id = cp.speciality_id
      WHERE cp.candidate_id = $1
    `, [cand.id]);
    console.log(`Preferences for Candidate ID ${cand.id}:`, prefs.rows);
  }

  const subRes = await client.query(`
    SELECT id, full_name, email, status, specialization, paid_amount, payment_id, payment_mode
    FROM application_submissions 
    WHERE full_name ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  console.log("Submissions found in application_submissions table:", subRes.rows);

  await client.end();
}

main().catch(console.error);
