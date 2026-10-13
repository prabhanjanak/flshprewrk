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
      console.log(`[INFO] Found local .env file at: ${envPath}`);
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim()
            .replace(/\r/g, '') // remove trailing carriage return
            .replace(/^['"]|['"]$/g, ''); // remove quotes
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn("[WARNING] Failed to load .env file automatically:", err.message);
  }

  // Use production DATABASE_URL if available, otherwise fallback to local connection string
  const connectionString = process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/fellowship_db";
  
  // Mask connection string password for secure logging
  const maskedConnection = connectionString.replace(/:([^:@]+)@/, ':***@');
  console.log(`[INFO] Connecting to database using: ${maskedConnection}`);

  const client = new pg.Client({ connectionString });
  await client.connect();

  console.log("Renaming specialties to canonical standard names...");
  
  // ID 1: 'Vitreo-Retina' (VR) -> 'Vitreo Retina' (VITR)
  await client.query("UPDATE specialities SET name = 'Vitreo Retina', code = 'VITR' WHERE id = 1");
  
  // ID 4: 'Cornea & Anterior Segment' (CAS) -> 'Cornea' (CORN)
  await client.query("UPDATE specialities SET name = 'Cornea', code = 'CORN' WHERE id = 4");
  
  // ID 5: 'Refractive Surgery' (RS) -> 'Phaco Refractive' (PHAC)
  await client.query("UPDATE specialities SET name = 'Phaco Refractive', code = 'PHAC' WHERE id = 5");

  console.log("Specialties renamed successfully!");
  
  const finalRes = await client.query("SELECT id, name, code FROM specialities ORDER BY id ASC");
  console.log("\nFINAL REMAINING SPECIALITIES IN DATABASE:");
  console.table(finalRes.rows);
  
  await client.end();
}

main().catch(console.error);
