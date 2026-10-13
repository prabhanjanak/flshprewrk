import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Connected to database. Querying columns named speciality_id or specialty_id...");
  const res = await client.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE column_name IN ('speciality_id', 'specialty_id')
    ORDER BY table_name;
  `);
  console.log("COLUMNS FOUND:");
  console.table(res.rows);

  await client.end();
}

main().catch(console.error);
