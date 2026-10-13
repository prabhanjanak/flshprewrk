import pg from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Connected to database. Fetching programs...");
  const progRes = await client.query("SELECT id, name, code FROM programs ORDER BY id");
  console.log("PROGRAMS:");
  console.table(progRes.rows);

  console.log("Fetching all specialities...");
  const specRes = await client.query("SELECT id, name, code, program_id FROM specialities ORDER BY id");
  console.log("SPECIALITIES:");
  console.table(specRes.rows);

  await client.end();
}

main().catch(console.error);
