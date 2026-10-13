import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Querying details for Dr. Lavanya G...");
  
  const cRes = await client.query(`
    SELECT * 
    FROM candidates 
    WHERE full_name ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  console.log("CANDIDATES ROWS:");
  console.log(JSON.stringify(cRes.rows, null, 2));

  const subRes = await client.query(`
    SELECT id, full_name, email, status, specialization, paid_amount, payment_id, payment_mode, center_preference
    FROM application_submissions 
    WHERE full_name ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  console.log("SUBMISSIONS ROWS:");
  console.log(JSON.stringify(subRes.rows, null, 2));

  if (cRes.rows.length > 0) {
    const candidateId = cRes.rows[0].id;
    const prefRes = await client.query(`
      SELECT cp.*, s.name as speciality_name 
      FROM candidate_preferences cp
      LEFT JOIN specialities s ON s.id = cp.speciality_id
      WHERE cp.candidate_id = $1
    `, [candidateId]);
    console.log("CANDIDATE PREFERENCES ROWS:");
    console.log(JSON.stringify(prefRes.rows, null, 2));
  }

  await client.end();
}

main().catch(console.error);
