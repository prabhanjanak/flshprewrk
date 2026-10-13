import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, specialitiesTable, applicationFormsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/specialities", requireAuth, async (req, res) => {
  const programIdRaw = req.query["programId"];
  const programId = programIdRaw ? Number(programIdRaw) : undefined;

  // Auto-sync specializations from Application Forms for this program
  try {
    const forms = programId 
      ? await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.programId, programId))
      : await db.select().from(applicationFormsTable);

    const existingSpecs = await db.select().from(specialitiesTable);
    const existingNameSet = new Set(existingSpecs.map(s => `${s.programId}_${s.name.trim().toLowerCase()}`));

    for (const form of forms) {
      const formProgId = form.programId;
      const formSpecs: string[] = [];

      // Extract from sectionsConfig
      if (Array.isArray(form.sectionsConfig)) {
        for (const section of form.sectionsConfig) {
          if (Array.isArray(section.fields)) {
            for (const field of section.fields) {
              if (
                field.id === "specialization" || 
                field.name === "specialization" ||
                field.label?.toLowerCase().includes("specialization") ||
                field.label?.toLowerCase().includes("speciality")
              ) {
                if (Array.isArray(field.options)) {
                  field.options.forEach((opt: string) => {
                    if (typeof opt === "string" && opt.trim()) formSpecs.push(opt.trim());
                  });
                }
              }
            }
          }
        }
      }

      // Extract from customFields
      if (Array.isArray(form.customFields)) {
        for (const field of form.customFields as any[]) {
          if (field.id === "specialization" || field.label?.toLowerCase().includes("specialization")) {
            if (Array.isArray(field.options)) {
              field.options.forEach((opt: string) => {
                if (typeof opt === "string" && opt.trim()) formSpecs.push(opt.trim());
              });
            }
          }
        }
      }

      for (const specName of formSpecs) {
        const key = `${formProgId}_${specName.toLowerCase()}`;
        if (!existingNameSet.has(key)) {
          const code = specName.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "SPEC";
          try {
            await db.insert(specialitiesTable).values({
              programId: formProgId,
              name: specName,
              code,
              seats: 5,
            });
            existingNameSet.add(key);
          } catch (_) {}
        }
      }
    }
  } catch (syncErr) {
    console.warn("[specialities-sync-warn]", syncErr);
  }

  let rows = await db.select().from(specialitiesTable);
  if (programId) rows = rows.filter((r) => r.programId === programId);

  // Secondary safeguard: deduplicate specialities by name case-insensitively
  const seen = new Set<string>();
  const uniqueRows: typeof rows = [];
  for (const r of rows) {
    const nameKey = `${r.programId}_${r.name.trim().toLowerCase()}`;
    if (!seen.has(nameKey)) {
      seen.add(nameKey);
      uniqueRows.push(r);
    }
  }
  rows = uniqueRows;


  const specFilledRows = (await db.execute(sql`
    SELECT speciality, COALESCE(SUM(allocated_seats), 0)::int as filled
    FROM seat_matrix_entries
    GROUP BY speciality
  `)).rows as Array<{ speciality: string; filled: number }>;

  const filledMap = new Map<string, number>();
  for (const r of specFilledRows) {
    filledMap.set(r.speciality.toLowerCase(), r.filled);
  }

  res.json(rows.map((s) => ({
    id: s.id,
    programId: s.programId,
    name: s.name,
    code: s.code,
    seats: s.seats,
    filledSeats: filledMap.get(s.name.toLowerCase()) ?? 0,
  })));
});

router.post("/specialities", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const { programId, name, code, seats } = req.body as {
    programId: number;
    name: string;
    code: string;
    seats: number;
  };
  if (!programId || !name || !code || seats == null) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }

  // Check if a speciality with the same name already exists case-insensitively
  const existing = await db.select().from(specialitiesTable);
  const isDuplicate = existing.some(
    (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (isDuplicate) {
    res.status(400).json({ error: `A speciality with the name "${name}" already exists.` });
    return;
  }

  const [s] = await db.insert(specialitiesTable).values({ programId, name, code, seats }).returning();
  if (!s) { res.status(500).json({ error: "Failed" }); return; }
  res.json({ id: s.id, programId: s.programId, name: s.name, code: s.code, seats: s.seats, filledSeats: 0 });
});

router.patch("/specialities/:specialityId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const id = Number(req.params["specialityId"]);
  const { name, seats } = req.body as { name?: string; seats?: number };
  const update: Record<string, unknown> = {};
  if (name !== undefined) update["name"] = name;
  if (seats !== undefined) update["seats"] = seats;
  const [s] = await db.update(specialitiesTable).set(update).where(eq(specialitiesTable.id, id)).returning();
  if (!s) { res.status(404).json({ error: "Not found" }); return; }

  const [specRow] = (await db.execute(sql`
    SELECT COALESCE(SUM(allocated_seats), 0)::int as filled
    FROM seat_matrix_entries
    WHERE LOWER(speciality) = LOWER(${s.name})
  `)).rows as Array<{ filled: number }>;
  const filled = specRow?.filled ?? 0;

  res.json({ id: s.id, programId: s.programId, name: s.name, code: s.code, seats: s.seats, filledSeats: filled });
});

export default router;
