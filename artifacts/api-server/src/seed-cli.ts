import "./lib/afm-fonts";
import { bootstrapDatabase } from "./lib/db-bootstrap";
import { logger } from "./lib/logger";

async function main() {
  console.log("=================================================");
  console.log("  Sankara Academy of Vision — Database Injector  ");
  console.log("  Intake: January 2027 | Exam: December 2026     ");
  console.log("=================================================\n");

  try {
    await bootstrapDatabase();
    console.log("\n=================================================");
    console.log("  SUCCESS: Database initialized & seeded!        ");
    console.log("  - Super Admins:");
    console.log("      * saravanan@sankaraeye.com (Saravanan@2026)");
    console.log("      * prabhanjan@sankaraeye.com (Prabhanjan@2026)");
    console.log("      * radhika@sankaraeye.com (Radhika@2026)");
    console.log("  - Program: Fellowship Program January 2027");
    console.log("  - Examination: December 2026");
    console.log("  - Application Form Token: JAN2027");
    console.log("  - Official Public URL:");
    console.log("      https://learn.sankaraeye.in/apply/JAN2027");
    console.log("=================================================\n");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "FATAL: Database injection failed");
    console.error("FATAL: Failed to inject database:", err);
    process.exit(1);
  }
}

main();
