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

  console.log("Starting candidate_preferences synchronization...");

  // Get all specialities
  const specRes = await client.query("SELECT id, name FROM specialities");
  const specialities = specRes.rows;
  console.log(`Loaded ${specialities.length} specialities from database.`);

  // Get all candidates
  const cRes = await client.query("SELECT id, full_name, email FROM candidates");
  const candidates = cRes.rows;
  console.log(`Loaded ${candidates.length} candidates.`);

  let fixCount = 0;

  for (const c of candidates) {
    // Check if they have preferences
    const prefRes = await client.query("SELECT id FROM candidate_preferences WHERE candidate_id = $1", [c.id]);
    
    if (prefRes.rows.length === 0) {
      console.log(`\nCandidate '${c.full_name}' (${c.email}) has 0 preferences in database.`);
      
      // Look up in application_submissions
      const subRes = await client.query(
        "SELECT id, specialization FROM application_submissions WHERE LOWER(email) = LOWER($1)",
        [c.email.trim()]
      );
      
      if (subRes.rows.length > 0) {
        const sub = subRes.rows[0];
        if (sub.specialization) {
          const specList = parseSpecializationString(sub.specialization);
          console.log(`  Found submission with specializations:`, specList);
          
          let order = 1;
          for (const specName of specList) {
            const spec = specialities.find(s => s.name.toLowerCase() === specName.toLowerCase());
            if (spec) {
              await client.query(
                "INSERT INTO candidate_preferences (candidate_id, speciality_id, preference_order) VALUES ($1, $2, $3)",
                [c.id, spec.id, order++]
              );
              console.log(`    Successfully inserted preference for: '${spec.name}' (order: ${order - 1})`);
              fixCount++;
            } else {
              console.warn(`    WARNING: Speciality '${specName}' not found in specialities table.`);
            }
          }
        } else {
          console.log("  No specialization field found in application submission.");
        }
      } else {
        console.log("  No matching application submission found by email.");
      }
    }
  }

  console.log(`\nSynchronization complete. Fixed and inserted ${fixCount} preference records.`);
  await client.end();
}

main().catch(console.error);
