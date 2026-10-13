const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: "postgresql://postgres:admin@localhost:5432/fellowship_db"
});

async function test() {
  const client = await pool.connect();
  try {
    const settingRes = await client.query("SELECT value FROM global_settings WHERE key = 'mock_mode'");
    const isMockMode = settingRes.rows[0]?.value === 'true';
    console.log("Mock Mode:", isMockMode);

    const subRes = await client.query(
      "SELECT count(*) FROM application_submissions WHERE form_id = 18 AND is_mock = $1",
      [isMockMode]
    );
    console.log("Submissions count:", subRes.rows[0].count);

    const allRes = await client.query("SELECT id, form_id, is_mock FROM application_submissions");
    console.log("All submissions in table:", allRes.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

test().catch(console.error);
