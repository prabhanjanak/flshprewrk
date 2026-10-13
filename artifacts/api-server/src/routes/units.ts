import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, unitsTable, candidatesTable, usersTable, documentsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/units", requireAuth, async (_req, res) => {
  const units = await db.select().from(unitsTable);
  const candidates = await db.select().from(candidatesTable);
  const users = await db.select().from(usersTable);
  const counts = new Map<number, number>();
  const staffCounts = new Map<number, number>();
  for (const c of candidates) {
    if (c.unitId != null) counts.set(c.unitId, (counts.get(c.unitId) ?? 0) + 1);
  }
  for (const u of users) {
    if (u.unitId != null) staffCounts.set(u.unitId, (staffCounts.get(u.unitId) ?? 0) + 1);
  }
  res.json(units.map((u) => ({
    id: u.id,
    name: u.name,
    city: u.city,
    location: u.location,
    candidateCount: counts.get(u.id) ?? 0,
    staffCount: staffCounts.get(u.id) ?? 0,
  })));
});

router.get("/units/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, id));
  if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }

  const staff = await db.select().from(usersTable).where(eq(usersTable.unitId, id));
  const candidates = await db.select().from(candidatesTable).where(eq(candidatesTable.unitId, id));
  const allDocs = await db.select().from(documentsTable);

  res.json({
    id: unit.id,
    name: unit.name,
    city: unit.city,
    location: unit.location,
    staff: staff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      salutation: u.salutation ?? null,
      employeeId: u.employeeId ?? null,
      active: u.active,
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      candidateCode: c.candidateCode,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone ?? null,
      status: c.status,
      dateOfBirth: c.dateOfBirth ?? null,
      gender: c.gender ?? null,
      qualification: c.qualification ?? null,
      collegeName: c.collegeName ?? null,
      address: c.address ?? null,
      createdAt: c.createdAt.toISOString(),
      documents: allDocs
        .filter((d) => d.candidateId === c.id)
        .map((d) => ({ id: d.id, docType: d.docType, fileName: d.fileName, fileUrl: d.fileUrl })),
    })),
  });
});

router.post("/units", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const { name, city, location } = req.body as { name: string; city?: string; location?: string };
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [u] = await db.insert(unitsTable).values({ name, city: city ?? null, location: location ?? null }).returning();
  if (!u) { res.status(500).json({ error: "Failed" }); return; }
  res.json({ id: u.id, name: u.name, city: u.city, location: u.location, candidateCount: 0, staffCount: 0 });
});

router.patch("/units/:id", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { name, city, location } = req.body as { name?: string; city?: string; location?: string };
  const update: Record<string, unknown> = {};
  if (name !== undefined) update["name"] = name;
  if (city !== undefined) update["city"] = city;
  if (location !== undefined) update["location"] = location;
  const [u] = await db.update(unitsTable).set(update).where(eq(unitsTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "Not found" }); return; }
  res.json(u);
});

router.delete("/units/:id", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const id = Number(req.params.id);
  await db.update(usersTable).set({ unitId: null }).where(eq(usersTable.unitId, id));
  await db.update(candidatesTable).set({ unitId: null }).where(eq(candidatesTable.unitId, id));
  await db.delete(unitsTable).where(eq(unitsTable.id, id));
  res.json({ success: true });
});

export default router;
