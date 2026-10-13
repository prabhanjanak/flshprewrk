import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("--- INTERVIEW PANELS ---");
  const panels = await client.query(`SELECT id, name, room_number, is_mind_matter FROM interview_panels`);
  console.log(panels.rows);

  console.log("--- PANEL MEMBERS ---");
  const members = await client.query(`
    SELECT ipm.panel_id, ipm.doctor_id, u.full_name, ipm.is_main, ipm.marks_entry_enabled
    FROM interview_panel_members ipm
    JOIN users u ON u.id = ipm.doctor_id
  `);
  console.log(members.rows);

  console.log("--- TABLE CONSTRAINTS ---");
  const constraints = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'interview_panel_members'::regclass
  `);
  console.log(constraints.rows);

  await client.end();
}

main().catch(console.error);
