import pg from 'pg';

function parseSpecializationString(spec) {
  if (!spec) return [];
  let s = spec.trim();
  if (!s) return [];

  // Handle PostgreSQL curly-brace array format: {"Cornea", "Phaco Refractive"}
  if (s.startsWith("{") && s.endsWith("}")) {
    s = s.substring(1, s.length - 1);
    const list = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        list.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim() || list.length > 0) {
      list.push(current.trim());
    }
    return list.map(item => {
      let cleaned = item;
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      return cleaned.trim();
    }).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* not JSON */ }
  
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

async function main() {
  const connectionString = "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Connected to local database. Checking Lavanya G...");
  
  const cRes = await client.query(`
    SELECT id, full_name, email, status, candidate_code 
    FROM candidates 
    WHERE full_name ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  const candidates = cRes.rows;

  const subRes = await client.query(`
    SELECT id, full_name, email, status, specialization, paid_amount, payment_id, payment_mode
    FROM application_submissions 
    WHERE full_name ILIKE '%Lavanya%' OR email ILIKE '%lavanya%'
  `);
  const submissions = subRes.rows;

  for (const c of candidates) {
    const prefs = []; // mock empty prefs
    let specializations = prefs;
    if (specializations.length === 0) {
      const sub = submissions.find(s => s.email?.toLowerCase() === c.email?.toLowerCase());
      if (sub && sub.specialization) {
        specializations = parseSpecializationString(sub.specialization);
      }
    }
    console.log(`Candidate ${c.full_name} (${c.email}) resolved specializations:`, specializations);
  }

  await client.end();
}

main().catch(console.error);
