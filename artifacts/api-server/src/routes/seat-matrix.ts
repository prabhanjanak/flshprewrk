import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { db, specialitiesTable, programsTable, seatMatrixEntriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

function getCanonicalSpecialtyName(name: string): string {
  const norm = name.toLowerCase().trim();
  if (norm.includes("medical retina")) return "Medical Retina";
  if (norm.includes("vitreo-retina") || norm.includes("vitreo retina") || norm.includes("pediatric retina") || norm.includes("retina")) {
    return "Vitreo Retina";
  }
  if (norm.includes("pediatric") || norm.includes("pediatric ophthalmology")) return "Pediatric Ophthalmology";
  if (norm.includes("cornea & anterior segment") || norm.includes("cornea") || norm.includes("ocular surface")) return "Cornea";
  if (norm.includes("glaucoma")) return "Glaucoma";
  if (norm.includes("iol") || norm.includes("fellowship")) return "IOL Fellowship";
  if (norm.includes("oculoplasty")) return "Oculoplasty";
  if (norm.includes("phaco") || norm.includes("refractive")) return "Phaco Refractive";
  return name; // fallback
}

const SPEC_ALIAS: Record<string, string> = {
  "cornea": "Cornea",
  "glaucoma": "Glaucoma",
  "iol#": "IOL Fellowship",
  "iol": "IOL Fellowship",
  "medical retina*": "Medical Retina",
  "medical retina": "Medical Retina",
  "oculoplasty": "Oculoplasty",
  "pediatric": "Pediatric Ophthalmology",
  "pediatric ophthalmology": "Pediatric Ophthalmology",
  "phaco refractive": "Phaco Refractive",
  "vitreo retina": "Vitreo Retina",
};

export const INTERVIEW_SCHEDULE = [
  {
    displayDate: "01 June 2026",
    category: "Posterior Segment",
    specialities: ["Vitreo Retina", "Medical Retina"],
    venue: "Bengaluru",
  },
  {
    displayDate: "08 June 2026",
    category: "Anterior Segment",
    specialities: ["IOL Fellowship", "Cornea", "Glaucoma", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive"],
    venue: "Bengaluru",
  },
];

export const INDUCTION_DATES = [
  { displayDate: "02–03 July 2026", event: "Fellows Induction", venue: "Bengaluru" },
  { displayDate: "06 July 2026",    event: "New Fellows Report to Respective Units", venue: "Respective Units" },
];

function findLatestFile(): string | null {
  const assetsDir = path.resolve(process.cwd(), "../../attached_assets");
  if (!fs.existsSync(assetsDir)) return null;
  const files = fs.readdirSync(assetsDir)
    .filter((f) => f.startsWith("Seat_Matrix_") && f.endsWith(".xlsx"))
    .sort().reverse();
  return files[0] ? path.join(assetsDir, files[0]) : null;
}

function parseMatrixFromFile() {
  const xlsxPath = findLatestFile();
  if (!xlsxPath) return null;
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][];
  const headerRow = allRows.find((r) => Array.isArray(r) && r[1] === "Unit/Speciality") as unknown[] | undefined;
  if (!headerRow) return null;

  const units: string[] = [];
  let totalColIdx = -1;
  for (let i = 2; i < headerRow.length; i++) {
    const v = String(headerRow[i] ?? "").trim();
    if (v.toLowerCase() === "total") { totalColIdx = i; break; }
    if (v) units.push(v);
  }

  const dataRows = allRows.filter((r) => {
    if (!Array.isArray(r)) return false;
    const spec = String(r[1] ?? "").trim().toLowerCase();
    return spec && spec !== "unit/speciality" && spec !== "total";
  });

  const rows = dataRows.map((r) => {
    const rawSpec = String(r[1] ?? "").trim();
    const specName = getCanonicalSpecialtyName(rawSpec);
    const seats: Record<string, number> = {};
    for (let i = 0; i < units.length; i++) {
      const v = r[i + 2];
      seats[units[i]!] = typeof v === "number" ? v : 0;
    }
    const total = totalColIdx >= 0 && typeof r[totalColIdx] === "number"
      ? (r[totalColIdx] as number)
      : Object.values(seats).reduce((a, b) => a + b, 0);
    return { speciality: specName, seats, total };
  });

  return { units, rows };
}

// GET /seat-matrix?programId=X
router.get(
  "/seat-matrix",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator", "unit_coordinator"),
  async (req, res) => {
    const programId = req.query["programId"] ? Number(req.query["programId"]) : null;

    const entries = programId
      ? await db.select().from(seatMatrixEntriesTable).where(eq(seatMatrixEntriesTable.programId, programId))
      : await db.select().from(seatMatrixEntriesTable);

    if (entries.length > 0) {
      const specialities = [...new Set(entries.map((e) => e.speciality))].sort();
      const units = [...new Set(entries.map((e) => e.unitName))].sort();
      const rows = specialities.map((spec) => {
        const specEntries = entries.filter((e) => e.speciality === spec);
        const seats: Record<string, { total: number; allocated: number }> = {};
        for (const u of units) {
          const entry = specEntries.find((e) => e.unitName === u);
          seats[u] = { total: entry?.totalSeats ?? 0, allocated: entry?.allocatedSeats ?? 0 };
        }
        const total = Object.values(seats).reduce((s, v) => s + v.total, 0);
        const totalAllocated = Object.values(seats).reduce((s, v) => s + v.allocated, 0);
        return { speciality: spec, seats, total, totalAllocated };
      });
      res.json({ units, rows, source: "db", interviewSchedule: INTERVIEW_SCHEDULE, inductionDates: INDUCTION_DATES });
      return;
    }

    // No entries for this program — return empty
    if (programId) {
      res.json({ units: [], rows: [], source: "db", interviewSchedule: INTERVIEW_SCHEDULE, inductionDates: INDUCTION_DATES });
      return;
    }

    // Fallback: Excel parse (no programId)
    const matrix = parseMatrixFromFile();
    if (!matrix) { res.status(404).json({ error: "Seat matrix not found. Please import the Excel file." }); return; }
    const rows = matrix.rows.map((r) => {
      const seats: Record<string, { total: number; allocated: number }> = {};
      for (const u of matrix.units) seats[u] = { total: r.seats[u] ?? 0, allocated: 0 };
      return { speciality: r.speciality, seats, total: r.total, totalAllocated: 0 };
    });
    res.json({ units: matrix.units, rows, source: "excel", interviewSchedule: INTERVIEW_SCHEDULE, inductionDates: INDUCTION_DATES });
  }
);

// POST /seat-matrix/import
router.post(
  "/seat-matrix/import",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const { programId: pidRaw } = req.body as { programId?: number };
    const matrix = parseMatrixFromFile();
    if (!matrix) { res.status(404).json({ error: "Seat matrix file not found" }); return; }

    let program;
    if (pidRaw) {
      [program] = await db.select().from(programsTable).where(eq(programsTable.id, Number(pidRaw)));
    }
    if (!program) { res.status(400).json({ error: "Program ID is required for import" }); return; }

    const existingSpecs = await db.select().from(specialitiesTable).where(eq(specialitiesTable.programId, program.id));
    const specMap = new Map(existingSpecs.map((s) => [s.name.toLowerCase(), s]));
    let updated = 0; let inserted = 0;

    for (const row of matrix.rows) {
      const key = row.speciality.toLowerCase();
      const existingSpec = specMap.get(key);
      if (existingSpec) {
        await db.update(specialitiesTable).set({ seats: row.total }).where(eq(specialitiesTable.id, existingSpec.id));
        updated++;
      } else {
        const code = row.speciality.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
        await db.insert(specialitiesTable).values({ programId: program.id, name: row.speciality, code, seats: row.total });
        inserted++;
      }

      for (const unit of matrix.units) {
        const totalSeats = row.seats[unit] ?? 0;
        await db.execute(sql`
          INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
          VALUES (${program.id}, ${row.speciality}, ${unit}, ${totalSeats}, 0)
          ON CONFLICT (program_id, speciality, unit_name) DO UPDATE
            SET total_seats = ${totalSeats}, updated_at = NOW()
        `);
      }
    }

    res.json({ success: true, updated, inserted, total: matrix.rows.length });
  }
);

// PATCH /seat-matrix/:speciality/:unit — inline CRUD edit
router.patch(
  "/seat-matrix/:speciality/:unit",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const speciality = decodeURIComponent(String(req.params["speciality"] ?? ""));
    const unitName = decodeURIComponent(String(req.params["unit"] ?? ""));
    const { totalSeats, programId: pidRaw } = req.body as { totalSeats: number; programId?: number };

    if (totalSeats === undefined || isNaN(Number(totalSeats)) || Number(totalSeats) < 0) {
      res.status(400).json({ error: "totalSeats must be ≥ 0" });
      return;
    }

    const seats = Number(totalSeats);
    let progId = pidRaw ? Number(pidRaw) : null;
    if (!progId) {
      res.status(400).json({ error: "Program ID is required" });
      return;
    }

    await db.execute(sql`
      INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
      VALUES (${progId}, ${speciality}, ${unitName}, ${seats}, 0)
      ON CONFLICT (program_id, speciality, unit_name) DO UPDATE
        SET total_seats = ${seats}, updated_at = NOW()
    `);

    res.json({ success: true, speciality, unitName, totalSeats: seats });
  }
);

// POST /seat-matrix/allocate
router.post(
  "/seat-matrix/allocate",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const { speciality, unitName, delta, programId: pidRaw } = req.body as { speciality: string; unitName: string; delta: number; programId?: number };
    if (!speciality || !unitName) { res.status(400).json({ error: "speciality and unitName required" }); return; }
    const d = (delta ?? 1) > 0 ? 1 : -1;
    let progId = pidRaw ? Number(pidRaw) : null;
    if (!progId) {
      res.status(400).json({ error: "Program ID is required" });
      return;
    }
    await db.execute(sql`
      INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
      VALUES (${progId}, ${speciality}, ${unitName}, 0, ${d > 0 ? 1 : 0})
      ON CONFLICT (program_id, speciality, unit_name) DO UPDATE
        SET allocated_seats = GREATEST(0, seat_matrix_entries.allocated_seats + ${d}), updated_at = NOW()
    `);
    res.json({ success: true });
  }
);

// POST /seat-matrix/speciality — add a new speciality row
router.post(
  "/seat-matrix/speciality",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const { name, programId: pidRaw } = req.body as { name: string; programId?: number };
    if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }
    if (!pidRaw) { res.status(400).json({ error: "programId required" }); return; }
    const speciality = getCanonicalSpecialtyName(name.trim());
    const progId = Number(pidRaw);

    const existing = await db.execute(sql`
      SELECT DISTINCT unit_name FROM seat_matrix_entries WHERE program_id = ${progId} ORDER BY unit_name
    `);
    const units = (existing.rows as { unit_name: string }[]).map((r) => r.unit_name);
    if (units.length === 0) {
      // Still allow adding a speciality even if no units yet — add empty row
      const code = speciality.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
      await db.execute(sql`
        INSERT INTO specialities (program_id, name, code, seats)
        VALUES (${progId}, ${speciality}, ${code}, 0)
        ON CONFLICT DO NOTHING
      `);
      res.json({ success: true, speciality, units: [] });
      return;
    }

    for (const unit of units) {
      await db.execute(sql`
        INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
        VALUES (${progId}, ${speciality}, ${unit}, 0, 0)
        ON CONFLICT (program_id, speciality, unit_name) DO NOTHING
      `);
    }

    const code = speciality.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
    await db.execute(sql`
      INSERT INTO specialities (program_id, name, code, seats)
      VALUES (${progId}, ${speciality}, ${code}, 0)
      ON CONFLICT DO NOTHING
    `);

    res.json({ success: true, speciality, units });
  }
);

// POST /seat-matrix/unit — add a new unit column
router.post(
  "/seat-matrix/unit",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const { name, programId: pidRaw } = req.body as { name: string; programId?: number };
    if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }
    if (!pidRaw) { res.status(400).json({ error: "programId required" }); return; }
    const unitName = name.trim();
    const progId = Number(pidRaw);

    const existing = await db.execute(sql`
      SELECT DISTINCT speciality FROM seat_matrix_entries WHERE program_id = ${progId} ORDER BY speciality
    `);
    const specialities = (existing.rows as { speciality: string }[]).map((r) => r.speciality);

    for (const spec of specialities) {
      await db.execute(sql`
        INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
        VALUES (${progId}, ${spec}, ${unitName}, 0, 0)
        ON CONFLICT (program_id, speciality, unit_name) DO NOTHING
      `);
    }

    res.json({ success: true, unitName, specialities });
  }
);

// DELETE /seat-matrix/speciality/:name
router.delete(
  "/seat-matrix/speciality/:name",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const name = decodeURIComponent(String(req.params["name"] ?? ""));
    const programId = req.query["programId"] ? Number(req.query["programId"]) : null;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    if (programId) {
      await db.execute(sql`DELETE FROM seat_matrix_entries WHERE speciality = ${name} AND program_id = ${programId}`);
      await db.execute(sql`DELETE FROM specialities WHERE name = ${name} AND program_id = ${programId}`);
    } else {
      await db.execute(sql`DELETE FROM seat_matrix_entries WHERE speciality = ${name}`);
      await db.execute(sql`DELETE FROM specialities WHERE name = ${name}`);
    }
    res.json({ success: true });
  }
);

// DELETE /seat-matrix/unit/:name
router.delete(
  "/seat-matrix/unit/:name",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const name = decodeURIComponent(String(req.params["name"] ?? ""));
    const programId = req.query["programId"] ? Number(req.query["programId"]) : null;
    if (!name) { res.status(400).json({ error: "name required" }); return; }
    if (programId) {
      await db.execute(sql`DELETE FROM seat_matrix_entries WHERE unit_name = ${name} AND program_id = ${programId}`);
    } else {
      await db.execute(sql`DELETE FROM seat_matrix_entries WHERE unit_name = ${name}`);
    }
    res.json({ success: true });
  }
);

// POST /seat-matrix/seed — seed Jul-26 matrix for a given program
router.post(
  "/seat-matrix/seed",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const { programId: pidRaw } = req.body as { programId?: number };

    const UNITS = [
      "Anand", "Bangalore", "Coimbatore", "Guntur", "Hyderabad",
      "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana",
      "Panvel", "Shimoga", "Varanasi",
    ];

    const MATRIX: Record<string, Record<string, number>> = {
      "Cornea":                  { Bangalore:1, Coimbatore:1, Hyderabad:3, Jaipur:1, Shimoga:1 },
      "Glaucoma":                { Bangalore:1, Coimbatore:1, Hyderabad:2, Jaipur:1 },
      "IOL Fellowship":          { Anand:2, Bangalore:1, Coimbatore:2, Guntur:3, Hyderabad:4, Indore:2, Jaipur:2, Kanpur:2, Krishnankoil:4, Ludhiana:2, Panvel:1, Shimoga:3, Varanasi:3 },
      "Medical Retina":          { Bangalore:1, Coimbatore:1, Hyderabad:3, Indore:1, Ludhiana:1 },
      "Oculoplasty":             { Bangalore:1, Panvel:1, Varanasi:1 },
      "Pediatric Ophthalmology": { Bangalore:1, Hyderabad:1, Ludhiana:1, Shimoga:1 },
      "Phaco Refractive":        { Bangalore:1 },
      "Vitreo Retina":           { Bangalore:3, Coimbatore:1, Hyderabad:2, Indore:1, Shimoga:1 },
    };

    let program;
    if (pidRaw) {
      [program] = await db.select().from(programsTable).where(eq(programsTable.id, Number(pidRaw)));
    }
    if (!program) { res.status(400).json({ error: "Program ID is required for seeding." }); return; }
    const progId = program.id;

    // Clean up garbage entries for this program
    await db.execute(sql`
      DELETE FROM seat_matrix_entries
      WHERE program_id = ${progId}
      AND speciality NOT IN (${sql.join(Object.keys(MATRIX).map((s) => sql`${s}`), sql`, `)})
    `);

    for (const [speciality, unitSeats] of Object.entries(MATRIX)) {
      for (const unit of UNITS) {
        const totalSeats = unitSeats[unit] ?? 0;
        await db.execute(sql`
          INSERT INTO seat_matrix_entries (program_id, speciality, unit_name, total_seats, allocated_seats)
          VALUES (${progId}, ${speciality}, ${unit}, ${totalSeats}, 0)
          ON CONFLICT (program_id, speciality, unit_name) DO UPDATE
            SET total_seats = ${totalSeats}, updated_at = NOW()
        `);
      }

      const total = Object.values(unitSeats).reduce((a, b) => a + b, 0);
      const code = speciality.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4);
      await db.execute(sql`DELETE FROM specialities WHERE name = ${speciality} AND program_id = ${progId}`);
      await db.execute(sql`
        INSERT INTO specialities (program_id, name, code, seats)
        VALUES (${progId}, ${speciality}, ${code}, ${total})
      `);
    }

    res.json({ success: true, programId: progId, programName: program.name, specialities: Object.keys(MATRIX).length, units: UNITS.length, total: 66 });
  }
);

export default router;
