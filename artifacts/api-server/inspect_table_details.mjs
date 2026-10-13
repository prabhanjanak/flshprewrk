import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  const tables = ['allocations', 'applications', 'batch_candidates', 'candidate_preferences', 'doctor_assignments', 'interview_panels', 'interview_scores'];
  
  for (const table of tables) {
    console.log(`--- Columns for table: ${table} ---`);
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position;
    `, [table]);
    console.table(res.rows);
  }

  await client.end();
}

main().catch(console.error);
