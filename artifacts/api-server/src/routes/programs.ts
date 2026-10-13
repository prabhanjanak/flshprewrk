import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, programsTable, specialitiesTable, candidatesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

async function programSummary(p: Record<string, any>) {
  const specs = await db.select().from(specialitiesTable).where(eq(specialitiesTable.programId, p.id));
  const totalSeats = specs.reduce((sum, s) => sum + s.seats, 0);

  const [allocatedCountRow] = (await db.execute(sql`
    SELECT COUNT(DISTINCT c.id)::int as count FROM candidates c
    JOIN candidate_preferences cp ON cp.candidate_id = c.id
    JOIN specialities s ON s.id = cp.speciality_id
    WHERE s.program_id = ${p.id} AND c.status = 'allocated'
  `)).rows as Array<{ count: number }>;
  const filledSeats = allocatedCountRow?.count ?? 0;

  const isMockVal = p.isMock === true;
  const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.isMock, isMockVal));
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    academicYear: p.academicYear,
    category: p.category || "fellowship",
    requiresApplicationForm: p.requiresApplicationForm !== false,
    requiresPayment: p.requiresPayment === true,
    feeAmount: p.feeAmount || 0,
    feePricingModel: p.feePricingModel || "per_specialty",
    requiresPsychometry: p.requiresPsychometry === true,
    requiresTheoryExam: p.requiresTheoryExam !== false,
    requiresInterviewViva: p.requiresInterviewViva !== false,
    requiredUploads: p.requiredUploads || ["photo"],
    hallTicketEnabled: p.hallTicketEnabled !== false,
    hallTicketReleased: p.hallTicketReleased === true,
    hallTicketPrefix: p.hallTicketPrefix || `${p.code}-2026`,
    examDate: p.examDate || "",
    examVenue: p.examVenue || "",
    examInstructions: p.examInstructions || "",
    offerLetterTemplateId: p.offerLetterTemplateId,
    totalSeats,
    specialityCount: specs.length,
    candidateCount: candidates.length,
    filledSeats,
  };
}

router.get("/programs", requireAuth, async (req: any, res) => {
  const programs = await db.select().from(programsTable).where(eq(programsTable.isMock, req.isMockMode));
  const out = [];
  for (const p of programs) {
    out.push(await programSummary(p));
  }
  res.json(out);
});

router.post("/programs", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const { 
    name, code, description, academicYear, category,
    requiresApplicationForm, requiresPayment, feeAmount, feePricingModel,
    requiresPsychometry, requiresTheoryExam, requiresInterviewViva,
    requiredUploads, hallTicketEnabled, hallTicketReleased, hallTicketPrefix,
    examDate, examVenue, examInstructions, offerLetterTemplateId 
  } = req.body;

  if (!name || !code || !academicYear) {
    res.status(400).json({ error: "Missing required fields (name, code, academicYear)" });
    return;
  }

  const [p] = await db.insert(programsTable).values({
    name,
    code,
    description: description ?? null,
    academicYear,
    category: category || "fellowship",
    requiresApplicationForm: requiresApplicationForm !== false,
    requiresPayment: requiresPayment === true,
    feeAmount: feeAmount ? Number(feeAmount) : 0,
    feePricingModel: feePricingModel || "per_specialty",
    requiresPsychometry: requiresPsychometry === true,
    requiresTheoryExam: requiresTheoryExam !== false,
    requiresInterviewViva: requiresInterviewViva !== false,
    requiredUploads: requiredUploads || ["photo"],
    hallTicketEnabled: hallTicketEnabled !== false,
    hallTicketReleased: hallTicketReleased === true,
    hallTicketPrefix: hallTicketPrefix || `${code}-2026`,
    examDate: examDate || null,
    examVenue: examVenue || null,
    examInstructions: examInstructions || null,
    offerLetterTemplateId: (offerLetterTemplateId != null ? Number(offerLetterTemplateId) : null) as any,
  }).returning();

  if (!p) { res.status(500).json({ error: "Failed to create program" }); return; }
  res.json(await programSummary(p));
});

router.patch("/programs/:programId", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const id = Number(req.params.programId);
  const data = req.body;
  const [updated] = await db.update(programsTable).set(data).where(eq(programsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Program not found" });
  res.json(await programSummary(updated));
});

router.get("/programs/:programId", requireAuth, async (req, res) => {
  const programId = Number(req.params["programId"]);
  const [p] = await db.select().from(programsTable).where(eq(programsTable.id, programId));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const specs = await db.select().from(specialitiesTable).where(eq(specialitiesTable.programId, programId));

  const specFilledRows = (await db.execute(sql`
    SELECT speciality, COALESCE(SUM(allocated_seats), 0)::int as filled
    FROM seat_matrix_entries
    GROUP BY speciality
  `)).rows as Array<{ speciality: string; filled: number }>;

  const filledMap = new Map<string, number>();
  for (const r of specFilledRows) {
    filledMap.set(r.speciality.toLowerCase(), r.filled);
  }

  const totalSeats = specs.reduce((s, x) => s + x.seats, 0);
  const candidates = await db.select().from(candidatesTable);
  res.json({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    academicYear: p.academicYear,
    offerLetterTemplateId: (p as any).offerLetterTemplateId,
    totalSeats,
    specialityCount: specs.length,
    candidateCount: candidates.length,
    specialities: specs.map((s) => ({
      id: s.id,
      programId: s.programId,
      name: s.name,
      code: s.code,
      seats: s.seats,
      filledSeats: filledMap.get(s.name.toLowerCase()) ?? 0,
    })),
  });
});

router.delete("/programs/:programId", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const programId = Number(req.params["programId"]);
  await db.delete(programsTable).where(eq(programsTable.id, programId));
  res.json({ success: true });
});

export default router;
