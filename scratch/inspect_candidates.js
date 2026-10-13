import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("=== INSPECTING KAVITHA AND VIBHAVA ===");
  
  const subRes = await client.query(`
    SELECT id, full_name, email, specialization, center_preference, custom_answers, form_data
    FROM application_submissions 
    WHERE full_name ILIKE '%Kavitha%' OR full_name ILIKE '%Vibhava%'
  `);
  
  console.log("Submissions found:", subRes.rows.length);
  for (const row of subRes.rows) {
    console.log("-----------------------------------------");
    console.log("ID:", row.id);
    console.log("Full Name:", row.full_name);
    console.log("Email:", row.email);
    console.log("Specialization:", row.specialization);
    console.log("Center Preference (Raw):", row.center_preference);
    console.log("FormData (Raw):", JSON.stringify(row.form_data));
    console.log("CustomAnswers (Raw):", JSON.stringify(row.custom_answers));
  }
  
  const cRes = await client.query(`
    SELECT id, full_name, email, status, candidate_code 
    FROM candidates 
    WHERE full_name ILIKE '%Kavitha%' OR full_name ILIKE '%Vibhava%'
  `);
  
  console.log("\nCandidates found:", cRes.rows.length);
  for (const c of cRes.rows) {
    console.log("Candidate ID:", c.id);
    console.log("Code:", c.candidate_code);
    console.log("Name:", c.full_name);
    console.log("Email:", c.email);
    
    // Check candidate preferences
    const prefRes = await client.query(`
      SELECT cp.id, cp.preference_order, s.name as spec_name 
      FROM candidate_preferences cp
      JOIN specialities s ON cp.speciality_id = s.id
      WHERE cp.candidate_id = $1
      ORDER BY cp.preference_order
    `, [c.id]);
    console.log("Preferences in candidate_preferences:", prefRes.rows);

    const appRes = await client.query(`
      SELECT a.id, a.hall_ticket_number, a.status, s.name as spec_name
      FROM applications a
      JOIN specialities s ON a.speciality_id = s.id
      WHERE a.candidate_id = $1
    `, [c.id]);
    console.log("Applications in applications table:", appRes.rows);
  }

  await client.end();
}

main().catch(console.error);
