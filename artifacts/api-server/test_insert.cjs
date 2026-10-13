const { Client } = require('pg');
const client = new Client('postgresql://postgres:admin@localhost:5432/fellowship_db');
client.connect().then(() => {
  client.query(`INSERT INTO batches (name, date, timing, venue, program_id, mcq_total_marks, psychometric_total_marks, interview_total_marks, is_mock) VALUES ('TEST', '2026-06-01', '9:00 AM - 1:00 PM', 'SEH', 1, 50, 50, 100, false) RETURNING *`)
    .then(res => console.log(res.rows))
    .catch(console.error)
    .finally(() => client.end());
});
