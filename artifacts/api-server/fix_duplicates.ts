import { db } from './src/db/index.js';
import { applicationSubmissionsTable } from './src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

async function fixDuplicates() {
  const all = await db.select().from(applicationSubmissionsTable);
  const byEmail = new Map();
  for (const sub of all) {
    if (!sub.email) continue;
    const key = sub.email.toLowerCase().trim();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(sub);
  }

  let deleted = 0;
  for (const [email, subs] of byEmail.entries()) {
    if (subs.length > 1) {
       // Sort by id, keep the first one
       subs.sort((a, b) => a.id - b.id);
       const toKeep = subs[0];
       const toDelete = subs.slice(1);
       
       console.log(`Email: ${email} has ${subs.length} subs. Keeping ID ${toKeep.id}, deleting IDs: ${toDelete.map(s => s.id).join(', ')}`);
       
       for (const sub of toDelete) {
          await db.delete(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.id, sub.id));
          deleted++;
       }
    }
  }
  console.log(`Deleted ${deleted} duplicate submissions.`);
  process.exit(0);
}

fixDuplicates().catch(console.error);
