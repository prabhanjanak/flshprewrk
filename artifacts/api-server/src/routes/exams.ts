import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, examsTable, questionsTable, programsTable, candidatesTable, candidateExamAssignmentsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/exams", requireAuth, async (req, res) => {
  const programId = req.query["programId"] ? Number(req.query["programId"]) : undefined;
  const kind = req.query["kind"] as string | undefined;
  let exams = await db.select().from(examsTable).where(eq(examsTable.isMock, (req as any).isMockMode));

  // Students only see exams that have been explicitly assigned to them
  if (req.user!.role === "student") {
    const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
    if (!c) { res.json([]); return; }
    const assignments = await db.select().from(candidateExamAssignmentsTable).where(eq(candidateExamAssignmentsTable.candidateId, c.id));
    const allowed = new Set(assignments.map((a) => a.examId));
    exams = exams.filter((e) => allowed.has(e.id));
  }

  if (programId) exams = exams.filter((e) => e.programId === programId);
  if (kind) exams = exams.filter((e) => e.kind === kind);
  const programs = await db.select().from(programsTable);
  const questions = await db.select().from(questionsTable);
  res.json(exams.map((e) => {
    const p = e.programId ? programs.find((x) => x.id === e.programId) : null;
    const qCount = questions.filter((q) => q.examId === e.id).length;
    return {
      id: e.id,
      title: e.title,
      kind: e.kind,
      programId: e.programId,
      programName: p?.name ?? null,
      durationMinutes: e.durationMinutes,
      totalQuestions: e.totalQuestions,
      questionCount: qCount,
      passingScore: e.passingScore,
      active: e.active,
      startsAt: e.startsAt?.toISOString() ?? null,
      endsAt: e.endsAt?.toISOString() ?? null,
    };
  }));
});

router.post("/exams", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const {
      title,
      kind,
      programId,
      durationMinutes,
      totalQuestions,
      passingScore,
      description,
      startsAt,
      endsAt
    } = req.body;

    if (!title || !kind) {
      return res.status(400).json({ error: "Missing title or type" });
    }

    const dur = Number(durationMinutes) || 60;
    const tq = Number(totalQuestions) || 20;
    const ps = passingScore != null ? Number(passingScore) : null;
    const pid = programId && !isNaN(Number(programId)) ? Number(programId) : null;
    const start = startsAt ? new Date(startsAt) : null;
    const end = endsAt ? new Date(endsAt) : null;

    // Use raw SQL to bypass the potentially outdated compiled schema in dist/
    const result = await db.execute(sql`
      INSERT INTO exams (
        title, kind, program_id, duration_minutes, total_questions, 
        passing_score, description, starts_at, ends_at, active
      ) VALUES (
        ${title}, ${kind}, ${pid}, ${dur}, ${tq}, 
        ${ps}, ${description || null}, ${start}, ${end}, true
      ) RETURNING *
    `);

    const e = result.rows[0];
    if (!e) throw new Error("Database insertion failed");

    res.json({
      id: e.id,
      title: e.title,
      kind: e.kind,
      programId: e.program_id,
      programName: null,
      durationMinutes: e.duration_minutes,
      totalQuestions: e.total_questions,
      questionCount: 0,
      passingScore: e.passing_score,
      active: e.active,
      startsAt: e.starts_at instanceof Date ? e.starts_at.toISOString() : (e.starts_at || null),
      endsAt: e.ends_at instanceof Date ? e.ends_at.toISOString() : (e.ends_at || null),
    });
  } catch (error: any) {
    console.error("[POST /exams] error:", error);
    res.status(500).json({ error: error.message || "Failed to create exam" });
  }
});

router.get("/exams/:examId", requireAuth, async (req, res) => {
  const id = Number(req.params["examId"]);
  const [e] = await db.select().from(examsTable).where(eq(examsTable.id, id));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const questions = await db.select().from(questionsTable).where(eq(questionsTable.examId, id));
  const programs = await db.select().from(programsTable);
  const p = e.programId ? programs.find((x) => x.id === e.programId) : null;
  res.json({
    id: e.id,
    title: e.title,
    kind: e.kind,
    programId: e.programId,
    programName: p?.name ?? null,
    durationMinutes: e.durationMinutes,
    totalQuestions: e.totalQuestions,
    questionCount: questions.length,
    passingScore: e.passingScore,
    active: e.active,
    startsAt: e.startsAt?.toISOString() ?? null,
    endsAt: e.endsAt?.toISOString() ?? null,
    description: e.description,
  });
});

router.delete("/exams/:examId", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  try {
    const id = Number(req.params["examId"]);
    // Cleanup answers first (linked to attempts)
    await db.execute(sql`DELETE FROM exam_answers WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ${id})`);
    // Cleanup assignments and attempts
    await db.execute(sql`DELETE FROM candidate_exam_assignments WHERE exam_id = ${id}`);
    await db.execute(sql`DELETE FROM exam_attempts WHERE exam_id = ${id}`);
    await db.execute(sql`DELETE FROM questions WHERE exam_id = ${id}`);
    await db.execute(sql`DELETE FROM exams WHERE id = ${id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete exam error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/exams/:examId/stats", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const id = Number(req.params["examId"]);
  const assignments = await db.execute(sql`SELECT COUNT(*) as count FROM candidate_exam_assignments WHERE exam_id = ${id}`);
  const completed = await db.execute(sql`SELECT COUNT(*) as count FROM candidate_exam_results WHERE exam_id = ${id}`);
  const [avgScore] = (await db.execute(sql`SELECT AVG(score) as avg FROM candidate_exam_results WHERE exam_id = ${id}`)).rows;

  res.json({
    totalAssigned: Number(assignments.rows[0]?.["count"] ?? 0),
    totalCompleted: Number(completed.rows[0]?.["count"] ?? 0),
    averageScore: Number(avgScore?.["avg"] ?? 0),
  });
});

export default router;
