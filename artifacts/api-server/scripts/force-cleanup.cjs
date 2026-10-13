const { Pool } = require('C:\\Users\\HP\\Desktop\\savprojectv2-version2\\savprojectv2-version2\\lib\\db\\node_modules\\pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:admin@localhost:5432/fellowship_db'
});

async function cleanup() {
  console.log("Cleaning up database...");
  try {
    // Truncate main tables with CASCADE to wipe all related data
    await pool.query('TRUNCATE TABLE application_submissions, application_forms, programs RESTART IDENTITY CASCADE');
    console.log("Truncated main application tables and all their dependents.");
    
    await pool.query(`
      INSERT INTO programs (name, code, academic_year, description) 
      VALUES (
        'Fellowship Program - July 2026', 
        'FP-JUL-2026', 
        '2026-27', 
        'Sankara Academy of Vision Fellowship Program for July 2026 batch.'
      )
    `);
    console.log("Created single program: Fellowship Program - July 2026.");
    
    console.log("Cleanup complete successfully.");
  } catch (err) {
    console.error("Cleanup failed:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

cleanup();
