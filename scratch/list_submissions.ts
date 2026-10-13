import { db, applicationSubmissionsTable } from "@workspace/db";

async function main() {
  console.log("Fetching submissions from database...");
  const subs = await db.select().from(applicationSubmissionsTable).limit(20);
  console.log(`Found ${subs.length} submissions:`);
  for (const s of subs) {
    console.log(`ID: ${s.id}, Email: ${s.email}, Name: ${s.fullName}, Status: ${s.status}, isMock: ${s.isMock}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
