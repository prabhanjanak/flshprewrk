import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, examsTable, questionsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/exams/:examId/questions", requireAuth, requireRole("super_admin", "program_admin", "central_exam_coordinator"), async (req, res) => {
  const examId = Number(req.params["examId"]);
  const qs = await db.select().from(questionsTable).where(eq(questionsTable.examId, examId));
  res.json(qs.map((q) => ({
    id: q.id,
    examId: q.examId,
    text: q.text,
    choices: q.choices,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
  })));
});

router.post("/exams/:examId/questions", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const examId = Number(req.params["examId"]);
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const body = req.body as { text: string; choices: string[]; correctIndex: number; explanation?: string };
  if (!body.text || !Array.isArray(body.choices) || body.correctIndex == null) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const [q] = await db.insert(questionsTable).values({
    examId,
    text: body.text,
    choices: body.choices,
    correctIndex: body.correctIndex,
    explanation: body.explanation ?? null,
  }).returning();
  if (!q) { res.status(500).json({ error: "Failed" }); return; }
  res.json({ id: q.id, examId: q.examId, text: q.text, choices: q.choices, correctIndex: q.correctIndex, explanation: q.explanation });
});

router.post("/exams/:examId/questions/bulk", requireAuth, requireRole("super_admin", "program_admin"), async (req, res) => {
  const examId = Number(req.params["examId"]);
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }
  const { rows } = req.body as {
    rows: Array<{ text: string; optionA: string; optionB: string; optionC: string; optionD: string; correct: string }>;
  };
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "rows required" }); return; }
  let inserted = 0;
  for (const row of rows) {
    if (!row.text || !row.optionA || !row.optionB || !row.correct) continue;
    const choices = [row.optionA, row.optionB, row.optionC, row.optionD].filter(Boolean);
    const correctLetter = row.correct.trim().toUpperCase();
    const correctIndex = ["A", "B", "C", "D"].indexOf(correctLetter);
    if (correctIndex === -1) continue;
    await db.insert(questionsTable).values({ examId, text: row.text, choices, correctIndex });
    inserted++;
  }
  res.json({ inserted });
});

export default router;
