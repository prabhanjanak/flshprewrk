import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("--- PANEL 69 DETAILS ---");
  const panel = await client.query(`SELECT * FROM interview_panels WHERE id = 69`);
  console.log(panel.rows);

  console.log("--- PANEL 69 MEMBERS ---");
  const members = await client.query(`
    SELECT ipm.doctor_id, u.full_name, ipm.is_main, ipm.marks_entry_enabled
    FROM interview_panel_members ipm
    JOIN users u ON u.id = ipm.doctor_id
    WHERE ipm.panel_id = 69
  `);
  console.log(members.rows);

  await client.end();
}

main().catch(console.error);
