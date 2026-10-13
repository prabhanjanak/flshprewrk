import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("=== INTERVIEW PANELS ===");
  const panelsRes = await client.query("SELECT * FROM interview_panels");
  console.log(panelsRes.rows);

  console.log("=== MEMBERS ===");
  const membersRes = await client.query("SELECT * FROM interview_panel_members");
  console.log(membersRes.rows);

  await client.end();
}

main().catch(console.error);
