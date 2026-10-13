import { db } from "../../packages/db/src/index";
import { batchesTable } from "../../packages/db/src/schema/exams";

async function test() {
  try {
    const [batch] = await db.insert(batchesTable).values({
      name: "TEST BATCH",
      segment: "Retina",
      date: new Date("2026-06-01"),
      timing: "09:00 AM - 01:00 PM",
      venue: "SEH, Bangalore",
      programId: 1,
      mcqTotalMarks: 50,
      psychometricTotalMarks: 50,
      interviewTotalMarks: 100,
      isMock: false,
    }).returning();
    console.log("Success:", batch);
  } catch (e) {
    console.error("DB Error:", e);
  }
}

test();
