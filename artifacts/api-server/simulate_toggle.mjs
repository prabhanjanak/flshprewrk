import pg from 'pg';

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  // Find an active session for a super_admin or central_exam_coordinator
  const sessionRes = await client.query(`
    SELECT us.token, u.role, u.full_name
    FROM user_sessions us
    JOIN users u ON u.id = us.user_id
    WHERE us.is_active = true AND u.role IN ('super_admin', 'program_admin', 'central_exam_coordinator')
    LIMIT 1
  `);
  
  const activeSession = sessionRes.rows[0];
  if (!activeSession) {
    console.error("No active admin/CEC session found in the database. Please make sure you are logged in on the frontend.");
    await client.end();
    return;
  }

  console.log(`Using session of ${activeSession.full_name} (${activeSession.role})`);
  const token = activeSession.token;
  const panelId = 69;

  // Fetch panel details first
  let res = await fetch(`http://localhost:3002/api/panels`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  let panels = await res.json();
  let panel = panels.find(p => p.id === panelId);
  console.log("Panel 69 members BEFORE toggle:", panel.members);

  // Toggle doctor_id 132
  console.log("\nToggling Dr. Anjali Menon (132) to marksEntryEnabled = true...");
  let postRes = await fetch(`http://localhost:3002/api/panels/${panelId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      doctorId: 132,
      marksEntryEnabled: true,
      isMain: false
    })
  });
  
  console.log("POST response status:", postRes.status);
  console.log("POST response body:", await postRes.text());

  // Fetch panel details after
  res = await fetch(`http://localhost:3002/api/panels`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  panels = await res.json();
  panel = panels.find(p => p.id === panelId);
  console.log("\nPanel 69 members AFTER toggle:", panel.members);

  await client.end();
}

main().catch(console.error);
