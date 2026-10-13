import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Checking triggers on interview_panel_members...");
  const res = await client.query(`
    SELECT tgname, pg_get_triggerdef(oid)
    FROM pg_trigger
    WHERE tgrelid = 'interview_panel_members'::regclass
  `);
  console.log(res.rows);

  await client.end();
}

main().catch(console.error);
