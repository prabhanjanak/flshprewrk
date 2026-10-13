import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function main() {
  // Automatically load environment variables from local .env file if it exists
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to load .env file automatically:", err.message);
  }

  // Use production DATABASE_URL if available, otherwise fallback to local connection string
  const connectionString = process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/fellowship_db";
  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log(`Connected to database. Starting robust specialty cleanup...`);

  // 1. Fetch all existing specialties
  const specRes = await client.query("SELECT id, name, code, program_id FROM specialities ORDER BY id ASC");
  const allSpecs = specRes.rows;
  console.log(`Found ${allSpecs.length} specialties in database.`);
  console.table(allSpecs);

  // 2. Fetch the first program ID to use for any missing canonical insertions
  const progRes = await client.query("SELECT id FROM programs LIMIT 1");
  const defaultProgramId = progRes.rows[0]?.id;
  if (!defaultProgramId) {
    console.error("No programs found in database. Seeding/migration must be run first.");
    await client.end();
    return;
  }

  // Define 8 canonical standard specialties
  const standardSpecs = [
    { name: 'Cornea', code: 'CORN' },
    { name: 'Glaucoma', code: 'GLAU' },
    { name: 'IOL Fellowship', code: 'IOLF' },
    { name: 'Medical Retina', code: 'MEDI' },
    { name: 'Oculoplasty', code: 'OCUL' },
    { name: 'Pediatric Ophthalmology', code: 'PEDI' },
    { name: 'Phaco Refractive', code: 'PHAC' },
    { name: 'Vitreo Retina', code: 'VITR' }
  ];

  // Helper to match a name to a canonical standard name
  function getCanonicalName(name) {
    const norm = name.toLowerCase().trim();
    if (norm.includes('medical retina')) {
      return 'Medical Retina';
    }
    if (norm.includes('vitreo-retina') || norm.includes('vitreo retina') || norm.includes('pediatric retina') || norm.includes('retina')) {
      return 'Vitreo Retina';
    }
    if (norm.includes('pediatric ophthalmology') || norm.includes('pediatric')) {
      return 'Pediatric Ophthalmology';
    }
    if (norm.includes('cornea & anterior segment') || norm.includes('cornea') || norm.includes('ocular surface')) {
      return 'Cornea';
    }
    if (norm.includes('glaucoma')) {
      return 'Glaucoma';
    }
    if (norm.includes('iol') || norm.includes('fellowship')) {
      return 'IOL Fellowship';
    }
    if (norm.includes('oculoplasty')) {
      return 'Oculoplasty';
    }
    if (norm.includes('phaco') || norm.includes('refractive')) {
      return 'Phaco Refractive';
    }
    return null;
  }

  // 3. Resolve the canonical ID for each of the 8 standard specialties
  const canonicalMap = {}; // name -> id

  for (const stdSpec of standardSpecs) {
    const matched = allSpecs.find(s => getCanonicalName(s.name) === stdSpec.name);
    if (matched) {
      canonicalMap[stdSpec.name] = matched.id;
      console.log(`Matched canonical specialty "${stdSpec.name}" to existing ID ${matched.id}`);
    } else {
      // Missing canonical specialty. Let's insert it dynamically.
      const insRes = await client.query(
        "INSERT INTO specialities (program_id, name, code, seats) VALUES ($1, $2, $3, $4) RETURNING id",
        [defaultProgramId, stdSpec.name, stdSpec.code, 0]
      );
      const newId = insRes.rows[0].id;
      canonicalMap[stdSpec.name] = newId;
      console.log(`Created missing canonical specialty "${stdSpec.name}" with ID ${newId}`);
    }
  }

  // Keep a set of the 8 canonical IDs
  const canonicalIds = Object.values(canonicalMap);

  // 4. Map EVERY specialty ID to a canonical ID
  const specMapping = {}; // oldId -> newId
  for (const s of allSpecs) {
    if (canonicalIds.includes(s.id)) {
      specMapping[s.id] = s.id; // already canonical
      continue;
    }

    const targetName = getCanonicalName(s.name);
    if (targetName && canonicalMap[targetName]) {
      specMapping[s.id] = canonicalMap[targetName];
      console.log(`Mapping duplicate/non-standard ID ${s.id} ("${s.name}") to canonical ID ${canonicalMap[targetName]} ("${targetName}")`);
    } else {
      // Fallback: Map to 'IOL Fellowship' (or any standard) if completely unmatched
      specMapping[s.id] = canonicalMap['IOL Fellowship'];
      console.log(`WARNING: Unmatched specialty ID ${s.id} ("${s.name}"). Fallback map to canonical 'IOL Fellowship' ID ${canonicalMap['IOL Fellowship']}`);
    }
  }

  // 5. Update dependent tables
  const tables = [
    'allocations',
    'applications',
    'batch_candidates',
    'candidate_preferences',
    'doctor_assignments',
    'interview_panels',
    'interview_scores'
  ];

  for (const table of tables) {
    console.log(`\nProcessing table "${table}"...`);

    // Fetch all rows with a non-canonical specialty ID
    const rowsRes = await client.query(`
      SELECT id, speciality_id 
      FROM ${table} 
      WHERE speciality_id IS NOT NULL
    `);

    let updatedCount = 0;
    let deletedCount = 0;

    for (const row of rowsRes.rows) {
      const currentId = row.speciality_id;
      const targetId = specMapping[currentId];

      if (targetId && targetId !== currentId) {
        try {
          await client.query(`UPDATE ${table} SET speciality_id = $1 WHERE id = $2`, [targetId, row.id]);
          updatedCount++;
        } catch (err) {
          if (err.code === '23505') {
            // Unique constraint violation (duplicate entry) -> delete the duplicate row
            await client.query(`DELETE FROM ${table} WHERE id = $1`, [row.id]);
            deletedCount++;
          } else {
            console.error(`Unexpected error updating row ${row.id} in "${table}":`, err.message);
            throw err;
          }
        }
      }
    }

    console.log(`Table "${table}": Updated ${updatedCount} rows, Deleted ${deletedCount} duplicates.`);
  }

  // 6. Delete all non-canonical specialties from the specialities table
  console.log("\nDeleting non-canonical specialties from the specialities table...");
  const deleteRes = await client.query(
    "DELETE FROM specialities WHERE id NOT IN (" + canonicalIds.join(",") + ")"
  );
  console.log(`Deleted ${deleteRes.rowCount} duplicate/non-canonical specialties.`);

  // 7. Confirm final list
  const finalRes = await client.query("SELECT id, name, code FROM specialities ORDER BY id ASC");
  console.log("\nFINAL REMAINING SPECIALITIES IN DATABASE:");
  console.table(finalRes.rows);

  await client.end();
  console.log("\nCleanup completed successfully!");
}

main().catch(console.error);
