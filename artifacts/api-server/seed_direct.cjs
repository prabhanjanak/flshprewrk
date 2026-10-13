const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: "postgresql://postgres:admin@localhost:5432/fellowship_db"
  });

  try {
    await client.connect();
    console.log("Seeding Database...");

    console.log("Cleaning up existing data...");
    await client.query("DELETE FROM seat_matrix_entries");
    await client.query("DELETE FROM batch_candidates");
    await client.query("DELETE FROM batches");
    await client.query("DELETE FROM application_submissions");
    await client.query("DELETE FROM candidates");
    await client.query("DELETE FROM programs");
    await client.query("DELETE FROM users WHERE email NOT LIKE '%@sankara.com'");

    console.log("Seeding Users...");
    await client.query(`
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES ('Admin User', 'admin@sankara.com', 'admin123', 'super_admin')
      ON CONFLICT (email) DO NOTHING
    `);

    console.log("Seeding July 2026 Batch...");
    const programRes = await client.query(`
      INSERT INTO programs (name, code, description, academic_year)
      VALUES ('Fellowship Program - July 2026', 'FP-JUL-2026', 'Sankara Academy of Vision Fellowship Program for July 2026 batch.', '2026-27')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const programId = programRes.rows[0].id;

    const batchRes = await client.query(`
      INSERT INTO batches (name, date, timing, program_id, mcq_total_marks, psychometric_total_marks, interview_total_marks)
      VALUES (
        'July 2026 Fellowship Exam',
        '2026-07-01 09:00:00+00',
        '09:00 AM - 05:00 PM',
        ${programId},
        50,
        50,
        100
      )
      RETURNING id
    `);
    const batchId = batchRes.rows[0].id;

    console.log("Seeding Application Form...");
    const formRes = await client.query(`
      INSERT INTO application_forms (title, program_id, token, is_active)
      VALUES ('July 2026 Fellowship Form', ${programId}, 'form-july-2026', true)
      ON CONFLICT (token) DO UPDATE SET title = EXCLUDED.title
      RETURNING id
    `);
    const formId = formRes.rows[0].id;

    console.log("Seeding Candidates...");
    const candidatesData = [
      { name: "Rahul Sharma", email: "rahul@example.com", phone: "+91 9876543210", code: "CAND001" },
      { name: "Priya Patel", email: "priya@example.com", phone: "+91 9876543211", code: "CAND002" },
      { name: "Amit Singh", email: "amit@example.com", phone: "+91 9876543212", code: "CAND003" },
      { name: "Sneha Reddy", email: "sneha@example.com", phone: "+91 9876543213", code: "CAND004" },
      { name: "Vikram Malhotra", email: "vikram@example.com", phone: "+91 9876543214", code: "CAND005" },
      { name: "Anjali Gupta", email: "anjali@example.com", phone: "+91 9876543215", code: "CAND006" },
      { name: "Siddharth Jain", email: "sid@example.com", phone: "+91 9876543216", code: "CAND007" },
      { name: "Kavita Rao", email: "kavita@example.com", phone: "+91 9876543217", code: "CAND008" },
      { name: "Vikash Verma", email: "vikash@example.com", phone: "+91 9876543218", code: "CAND009" },
      { name: "Deepika Padukone", email: "deepika@example.com", phone: "+91 9876543219", code: "CAND010" }
    ];

    for (const cand of candidatesData) {
      const candRes = await client.query(`
        INSERT INTO candidates (full_name, email, phone, candidate_code, status)
        VALUES ($1, $2, $3, $4, 'pending')
        ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
        RETURNING id
      `, [cand.name, cand.email, cand.phone, cand.code]);
      
      const candidateId = candRes.rows[0].id;

      await client.query(`
        INSERT INTO application_submissions (candidate_id, form_id, full_name, email, status, paid_amount, payment_id, payment_mode)
        VALUES ($1, $2, $3, $4, 'submitted', 50000, $5, 'Online')
        ON CONFLICT DO NOTHING
      `, [candidateId, formId, cand.name, cand.email, `PAYID-${cand.code}`]);

      await client.query(`
        INSERT INTO batch_candidates (batch_id, candidate_id, status)
        VALUES ($1, $2, 'assigned')
        ON CONFLICT DO NOTHING
      `, [batchId, candidateId]);
    }

    console.log("Database Seeded Successfully!");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
