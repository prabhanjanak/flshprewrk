import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

async function check() {
  const users = await db.select().from(usersTable);
  console.log('--- ALL USERS ---');
  users.forEach(u => console.log(`${u.id}: ${u.email} (Role: ${u.role})`));
  console.log('-----------------');
}

check().catch(console.error);
