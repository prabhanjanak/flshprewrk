import { db, programsTable, applicationFormsTable, seatMatrixEntriesTable, unitsTable } from "@workspace/db";
import { DEFAULT_SECTIONS } from "../artifacts/api-server/src/lib/default-sections";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Initializing July 2026 Live Environment...");

  // 1. Create Program
  const [program] = await db.insert(programsTable).values({
    name: "Fellowship Program July 2026",
    code: "FP-JULY-2026",
    academicYear: "2026",
    description: "Advanced surgical fellowship in various ophthalmology sub-specialities for the July 2026 cycle.",
    isMock: false
  }).returning();

  console.log(`Created Program: ${program.name} (ID: ${program.id})`);

  // 2. Create Application Form
  const [form] = await db.insert(applicationFormsTable).values({
    programId: program.id,
    title: "July 2026 Admissions Application Form",
    token: "JULY2026",
    deadline: new Date("2026-06-15"),
    isActive: true,
    sectionsConfig: JSON.stringify(DEFAULT_SECTIONS)
  }).returning();

  console.log(`Created Application Form: ${form.title} (Token: ${form.token})`);

  // 3. Populate Seat Matrix (Live)
  const units = await db.select().from(unitsTable).where(eq(unitsTable.isMock, false));
  const subspecialties = ["Cornea", "Glaucoma", "IOL", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Medical Retina", "Vitreo Retina"];

  if (units.length === 0) {
     console.log("No live units found. Creating default live units...");
     const defaultUnits = ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Ludhiana", "Panvel", "Chennai"];
     for (const name of defaultUnits) {
       await db.insert(unitsTable).values({ name, city: name, isMock: false });
     }
  }

  const liveUnits = await db.select().from(unitsTable).where(eq(unitsTable.isMock, false));
  
  for (const spec of subspecialties) {
    for (const unit of liveUnits) {
      await db.insert(seatMatrixEntriesTable).values({
        programId: program.id,
        speciality: spec,
        unitName: unit.name,
        totalSeats: 2 // Defaulting to 2 seats per unit/spec
      });
    }
  }

  console.log("Seat matrix initialized for all live units.");
  console.log("July 2026 Live Environment Setup Complete.");
  process.exit(0);
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
