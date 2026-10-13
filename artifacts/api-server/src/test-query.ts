import { db, applicationSubmissionsTable, globalSettingsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";

async function test() {
  const [setting] = await db.select().from(globalSettingsTable).where(eq(globalSettingsTable.key, "mock_mode"));
  const isMockMode = setting?.value === "true";
  console.log("Mock Mode:", isMockMode);

  const formId = 18;
  const subs = await db
    .select()
    .from(applicationSubmissionsTable)
    .where(and(eq(applicationSubmissionsTable.formId, formId), eq(applicationSubmissionsTable.isMock, isMockMode)))
    .orderBy(desc(applicationSubmissionsTable.submittedAt));
  
  console.log("Submissions count:", subs.length);
  if (subs.length > 0) {
    console.log("First sub name:", subs[0].fullName);
  }
  process.exit(0);
}

test().catch(console.error);
