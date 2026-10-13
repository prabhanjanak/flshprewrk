import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  candidatesTable,
  examsTable,
  candidateExamAssignmentsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get(
  "/candidates/:candidateId/exam-assignments",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const candidateId = Number(req.params["candidateId"]);
    const rows = await db
      .select()
      .from(candidateExamAssignmentsTable)
      .where(eq(candidateExamAssignmentsTable.candidateId, candidateId));
    const exams = await db.select().from(examsTable);
    res.json(
      rows.map((r) => {
        const e = exams.find((x) => x.id === r.examId);
        return {
          id: r.id,
          examId: r.examId,
          examTitle: e?.title ?? "",
          examKind: e?.kind ?? "",
          assignedAt: r.assignedAt.toISOString(),
        };
      }),
    );
  },
);

router.put(
  "/candidates/:candidateId/exam-assignments",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const candidateId = Number(req.params["candidateId"]);
    const { examIds } = req.body as { examIds: number[] };
    if (!Array.isArray(examIds)) {
      res.status(400).json({ error: "examIds must be an array" });
      return;
    }

    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidateId));
    if (!candidate) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    // Coordinator can only assign for candidates in their own unit
    if (req.user!.role === "central_exam_coordinator") {
      const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
      if (!me?.unitId || candidate.unitId !== me.unitId) {
        res.status(403).json({ error: "You can only assign exams to candidates in your unit" });
        return;
      }
    }

    // Replace assignments: delete then insert
    await db.delete(candidateExamAssignmentsTable).where(eq(candidateExamAssignmentsTable.candidateId, candidateId));
    if (examIds.length > 0) {
      // Verify all examIds exist
      const exams = await db.select().from(examsTable).where(inArray(examsTable.id, examIds));
      const validIds = new Set(exams.map((e) => e.id));
      const toInsert = examIds
        .filter((id) => validIds.has(id))
        .map((examId) => ({
          candidateId,
          examId,
        }));
      if (toInsert.length > 0) {
        await db.insert(candidateExamAssignmentsTable).values(toInsert);
      }
    }

    const rows = await db
      .select()
      .from(candidateExamAssignmentsTable)
      .where(eq(candidateExamAssignmentsTable.candidateId, candidateId));
    const exams = await db.select().from(examsTable);
    res.json(
      rows.map((r) => {
        const e = exams.find((x) => x.id === r.examId);
        return {
          id: r.id,
          examId: r.examId,
          examTitle: e?.title ?? "",
          examKind: e?.kind ?? "",
          assignedAt: r.assignedAt.toISOString(),
        };
      }),
    );
  },
);

// Helper for student-side: list candidates assigned to a given exam (used by coordinator dashboard later)
router.get(
  "/exams/:examId/assigned-candidates",
  requireAuth,
  requireRole("super_admin", "program_admin", "central_exam_coordinator"),
  async (req, res) => {
    const examId = Number(req.params["examId"]);
    const rows = await db
      .select()
      .from(candidateExamAssignmentsTable)
      .where(eq(candidateExamAssignmentsTable.examId, examId));
    const candidates = await db.select().from(candidatesTable);
    const units = await db.select().from(unitsTable);
    res.json(
      rows.map((r) => {
        const c = candidates.find((x) => x.id === r.candidateId);
        const unit = c?.unitId ? units.find((u) => u.id === c.unitId) : null;
        return {
          assignmentId: r.id,
          candidateId: r.candidateId,
          candidateCode: c?.candidateCode ?? "",
          fullName: c?.fullName ?? "",
          unitName: unit?.name ?? null,
          assignedAt: r.assignedAt.toISOString(),
        };
      }),
    );
    void and; // keep import
  },
);

export default router;
