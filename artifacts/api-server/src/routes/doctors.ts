import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, usersTable, unitsTable, doctorAssignmentsTable, candidatesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/doctors", requireAuth, requireRole("super_admin", "program_admin"), async (_req, res) => {
  const allDoctors = (await db.select().from(usersTable)).filter((u) => u.role === "doctor");
  const units = await db.select().from(unitsTable);
  const assigns = await db.select().from(doctorAssignmentsTable);
  res.json(allDoctors.map((d) => {
    const unit = d.unitId ? units.find((u) => u.id === d.unitId) : null;
    const count = assigns.filter((a) => a.doctorId === d.id).length;
    return {
      id: d.id,
      userId: d.id,
      fullName: d.fullName,
      email: d.email,
      unitId: d.unitId,
      unitName: unit?.name ?? null,
      assignedCandidates: count,
    };
  }));
});

router.post("/doctors/:doctorId/assign-unit", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const doctorId = Number(req.params["doctorId"]);
  const { unitId } = req.body as { unitId: number };
  const [d] = await db.update(usersTable).set({ unitId }).where(
    and(eq(usersTable.id, doctorId), eq(usersTable.role, "doctor")),
  ).returning();
  if (!d) { res.status(404).json({ error: "Doctor not found" }); return; }
  const units = await db.select().from(unitsTable);
  const unit = d.unitId ? units.find((u) => u.id === d.unitId) : null;
  const assigns = await db.select().from(doctorAssignmentsTable).where(eq(doctorAssignmentsTable.doctorId, d.id));
  res.json({
    id: d.id,
    userId: d.id,
    fullName: d.fullName,
    email: d.email,
    unitId: d.unitId,
    unitName: unit?.name ?? null,
    assignedCandidates: assigns.length,
  });
});

router.post("/doctors/:doctorId/assign-candidate", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const doctorId = Number(req.params["doctorId"]);
  const { candidateId } = req.body as { candidateId: number };
  const [d] = await db.select().from(usersTable).where(eq(usersTable.id, doctorId));
  if (!d || d.role !== "doctor") { res.status(404).json({ error: "Doctor not found" }); return; }
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const existing = await db.select().from(doctorAssignmentsTable).where(
    and(eq(doctorAssignmentsTable.doctorId, doctorId), eq(doctorAssignmentsTable.candidateId, candidateId)),
  );
  let row;
  if (existing.length > 0) {
    row = existing[0]!;
  } else {
    [row] = await db.insert(doctorAssignmentsTable).values({
      doctorId,
      candidateId,
      status: "pending",
    }).returning();
  }
  if (!row) { res.status(500).json({ error: "Failed" }); return; }
  const units = await db.select().from(unitsTable);
  const unit = c.unitId ? units.find((u) => u.id === c.unitId) : null;
  res.json({
    id: row.id,
    candidateId: row.candidateId,
    candidateName: c.fullName,
    candidateCode: c.candidateCode,
    unitName: unit?.name ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    status: row.status,
    existingScore: null,
  });
});

export default router;
