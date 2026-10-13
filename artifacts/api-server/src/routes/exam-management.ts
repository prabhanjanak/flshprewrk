import { Router } from "express";
import { db, batchesTable, batchCandidatesTable, documentTemplatesTable, candidatesTable, applicationsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Batches
router.get("/batches", requireAuth, async (req: any, res) => {
  try {
    const batches = await db.select().from(batchesTable).where(eq(batchesTable.isMock, req.isMockMode));
    const enriched = await Promise.all(batches.map(async (b) => {
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(batchCandidatesTable)
        .where(eq(batchCandidatesTable.batchId, b.id));
      return { ...b, candidateCount: count };
    }));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

function parseDateString(str: any): Date {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  const s = String(str).trim();
  const yyyymmdd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (yyyymmdd) {
    return new Date(Date.UTC(Number(yyyymmdd[1]), Number(yyyymmdd[2]) - 1, Number(yyyymmdd[3])));
  }
  const ddmmyyyy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (ddmmyyyy) {
    return new Date(Date.UTC(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1])));
  }
  return new Date(s);
}

router.post("/batches", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const [batch] = await db.insert(batchesTable).values({
      name: String(req.body.name || ""),
      segment: req.body.segment ? String(req.body.segment) : null,
      date: parseDateString(req.body.date),
      timing: String(req.body.timing || ""),
      venue: req.body.venue ? String(req.body.venue) : "SEH, Bangalore",
      programId: Number(req.body.programId),
      mcqTotalMarks: Number(req.body.mcqTotalMarks) || 50,
      psychometricTotalMarks: Number(req.body.psychometricTotalMarks) || 50,
      interviewTotalMarks: Number(req.body.interviewTotalMarks) || 100,
      isMock: req.isMockMode || false,
    }).returning();
    res.json(batch);
  } catch (e: any) {
    const fs = require("fs");
    fs.writeFileSync("batch_error_log.txt", String(e) + "\n" + (e.stack || ""));
    res.status(500).json({ error: String(e) });
  }
});

router.get("/batches/:id/candidates", requireAuth, async (req: any, res) => {
  try {
    const batchId = Number(req.params.id);
    const rows = await db.select().from(batchCandidatesTable).where(eq(batchCandidatesTable.batchId, batchId));
    const candIds = rows.map(r => r.candidateId);
    if (candIds.length === 0) { res.json([]); return; }
    
    const candidates = await db.select().from(candidatesTable);
    res.json(rows.map(r => {
      const c = candidates.find(x => x.id === r.candidateId);
      return {
        ...r,
        candidateName: c?.fullName ?? "Unknown",
        candidateCode: c?.candidateCode ?? "N/A"
      };
    }));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/batches/:id/marks", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const batchId = Number(req.params.id);
    const { updates } = req.body as { updates: { candidateId: number; mcqScore?: number; psychometricScore?: number; interviewScore?: number }[] };
    
    for (const u of updates) {
      await db.update(batchCandidatesTable)
        .set({
          mcqScore: u.mcqScore,
          psychometricScore: u.psychometricScore,
          interviewScore: u.interviewScore,
          status: "completed"
        })
        .where(and(eq(batchCandidatesTable.batchId, batchId), eq(batchCandidatesTable.candidateId, u.candidateId)));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/batches/:id/candidates", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const batchId = Number(req.params.id);
    const { candidateIds } = req.body as { candidateIds: number[] };
    
    const values = candidateIds.map(cid => ({
      batchId,
      candidateId: cid,
    }));
    
    await db.insert(batchCandidatesTable).values(values);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/batches/:id", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const batchId = Number(req.params.id);
    
    // 1. Reset all applications referencing this batch back to "approved" and clear batchId
    await db.update(applicationsTable)
      .set({ batchId: null, status: "approved" })
      .where(eq(applicationsTable.batchId, batchId));

    // 2. Delete entries in batchCandidatesTable referencing this batch
    await db.delete(batchCandidatesTable)
      .where(eq(batchCandidatesTable.batchId, batchId));

    // 3. Delete the batch itself from batchesTable
    const [deleted] = await db.delete(batchesTable)
      .where(eq(batchesTable.id, batchId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Batch not found" });
    }

    res.json({ success: true, deleted });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Templates
router.get("/templates", requireAuth, async (req: any, res) => {
  try {
    const templates = await db.select().from(documentTemplatesTable);
    res.json(templates);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/templates", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const [template] = await db.insert(documentTemplatesTable).values(req.body).returning();
    res.json(template);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/templates/:id", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req: any, res) => {
  try {
    const [updated] = await db.update(documentTemplatesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(documentTemplatesTable.id, Number(req.params.id)))
      .returning();
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
