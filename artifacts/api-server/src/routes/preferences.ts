import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, candidatesTable, candidatePreferencesTable, specialitiesTable, programsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

async function listPrefs(candidateId: number) {
  const prefs = await db.select().from(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, candidateId));
  const specs = await db.select().from(specialitiesTable);
  const programs = await db.select().from(programsTable);
  return prefs.sort((a, b) => a.preferenceOrder - b.preferenceOrder).map((p) => {
    const sp = specs.find((s) => s.id === p.specialityId);
    const pg = sp ? programs.find((g) => g.id === sp.programId) : null;
    return {
      id: p.id,
      specialityId: p.specialityId,
      specialityName: sp?.name ?? "",
      programName: pg?.name ?? "",
      preferenceOrder: p.preferenceOrder,
    };
  });
}

router.get("/preferences/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  res.json(await listPrefs(c.id));
});

router.put("/preferences/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const { specialityIds } = req.body as { specialityIds: number[] };
  if (!Array.isArray(specialityIds)) { res.status(400).json({ error: "specialityIds required" }); return; }
  await db.delete(candidatePreferencesTable).where(eq(candidatePreferencesTable.candidateId, c.id));
  if (specialityIds.length > 0) {
    await db.insert(candidatePreferencesTable).values(
      specialityIds.map((specId, idx) => ({
        candidateId: c.id,
        specialityId: specId,
        preferenceOrder: idx + 1,
      })),
    );
  }
  res.json(await listPrefs(c.id));
});

export default router;
