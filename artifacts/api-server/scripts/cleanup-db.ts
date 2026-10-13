import { db } from "../src/db";
import { applicationFormsTable, applicationSubmissionsTable } from "../src/db/schema";
import { eq, ne } from "drizzle-orm";

async function cleanup() {
  console.log("Cleaning up application forms and submissions...");
  
  // Delete all submissions
  const subsDeleted = await db.delete(applicationSubmissionsTable);
  console.log("Deleted submissions.");

  // Delete all forms
  const formsDeleted = await db.delete(applicationFormsTable);
  console.log("Deleted forms.");

  console.log("Cleanup complete.");
  process.exit(0);
}

cleanup().catch(err => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
