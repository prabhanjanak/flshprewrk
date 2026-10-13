import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Connected to database. Fetching specialities...");
  const res = await client.query("SELECT id, name, code FROM specialities ORDER BY id");
  console.log("SPECIALITIES:");
  console.table(res.rows);

  await client.end();
}

main().catch(console.error);
