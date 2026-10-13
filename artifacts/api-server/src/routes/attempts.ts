import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  candidatesTable,
  examsTable,
  questionsTable,
  examAttemptsTable,
  examAnswersTable,
  candidateExamAssignmentsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

async function buildAttemptInProgress(attemptId: number) {
  const [a] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, attemptId));
  if (!a) return null;
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, a.examId));
  if (!exam) return null;
  const qs = await db.select().from(questionsTable).where(eq(questionsTable.examId, a.examId));
  const answers = await db.select().from(examAnswersTable).where(eq(examAnswersTable.attemptId, attemptId));
  return {
    id: a.id,
    examId: a.examId,
    examTitle: exam.title,
    examKind: exam.kind,
    durationMinutes: exam.durationMinutes,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
    questions: qs.map((q) => ({
      id: q.id,
      text: q.text,
      choices: q.choices,
    })),
    savedAnswers: answers.map((ans) => ({
      questionId: ans.questionId,
      selectedIndex: ans.selectedIndex,
    })),
  };
}

router.post("/attempts/start", requireAuth, requireRole("student"), async (req, res) => {
  const { examId } = req.body as { examId: number };
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, examId));
  if (!exam) { res.status(404).json({ error: "Exam not found" }); return; }

  const [assignment] = await db.select().from(candidateExamAssignmentsTable).where(
    and(
      eq(candidateExamAssignmentsTable.candidateId, c.id),
      eq(candidateExamAssignmentsTable.examId, examId),
    ),
  );
  if (!assignment) {
    res.status(403).json({ error: "You are not assigned to this exam." });
    return;
  }

  const existing = await db.select().from(examAttemptsTable).where(
    and(eq(examAttemptsTable.candidateId, c.id), eq(examAttemptsTable.examId, examId)),
  );
  const live = existing.find((x) => x.submittedAt == null);
  if (live) {
    const out = await buildAttemptInProgress(live.id);
    res.json(out);
    return;
  }
  const submitted = existing.find((x) => x.submittedAt != null);
  if (submitted) {
    res.status(409).json({ error: "Already submitted this exam" });
    return;
  }

  const [att] = await db.insert(examAttemptsTable).values({
    candidateId: c.id,
    examId,
    maxScore: exam.totalQuestions,
  }).returning();
  if (!att) { res.status(500).json({ error: "Failed" }); return; }

  const out = await buildAttemptInProgress(att.id);
  res.json(out);
});

router.get("/attempts/:attemptId", requireAuth, async (req, res) => {
  const id = Number(req.params["attemptId"]);
  const out = await buildAttemptInProgress(id);
  if (!out) { res.status(404).json({ error: "Not found" }); return; }
  res.json(out);
});

router.post("/attempts/:attemptId/answer", requireAuth, requireRole("student"), async (req, res) => {
  const attemptId = Number(req.params["attemptId"]);
  const { questionId, selectedIndex } = req.body as { questionId: number; selectedIndex: number | null };
  const existing = await db.select().from(examAnswersTable).where(
    and(eq(examAnswersTable.attemptId, attemptId), eq(examAnswersTable.questionId, questionId)),
  );
  if (existing.length > 0) {
    await db.update(examAnswersTable).set({ selectedIndex: selectedIndex ?? null }).where(eq(examAnswersTable.id, existing[0]!.id));
  } else {
    await db.insert(examAnswersTable).values({ attemptId, questionId, selectedIndex: selectedIndex ?? null });
  }
  res.json({ ok: true });
});

router.post("/attempts/:attemptId/submit", requireAuth, requireRole("student"), async (req, res) => {
  const attemptId = Number(req.params["attemptId"]);
  const [att] = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.id, attemptId));
  if (!att) { res.status(404).json({ error: "Not found" }); return; }
  if (att.submittedAt) {
    res.json({ id: att.id, examId: att.examId, score: att.score ?? 0, maxScore: att.maxScore ?? 0, submittedAt: att.submittedAt.toISOString() });
    return;
  }

  const qs = await db.select().from(questionsTable).where(eq(questionsTable.examId, att.examId));
  const answers = await db.select().from(examAnswersTable).where(eq(examAnswersTable.attemptId, attemptId));

  let score = 0;
  const maxScore = qs.length;
  for (const q of qs) {
    const ans = answers.find((a) => a.questionId === q.id);
    if (!ans) continue;
    if (ans.selectedIndex === q.correctIndex) score++;
  }

  const submittedAt = new Date();
  await db.update(examAttemptsTable).set({ submittedAt, score, maxScore }).where(eq(examAttemptsTable.id, attemptId));

  res.json({ id: att.id, examId: att.examId, score, maxScore, submittedAt: submittedAt.toISOString() });
});

router.get("/attempts/me", requireAuth, requireRole("student"), async (req, res) => {
  const [c] = await db.select().from(candidatesTable).where(eq(candidatesTable.userId, req.user!.userId));
  if (!c) { res.status(404).json({ error: "Candidate not found" }); return; }
  const atts = await db.select().from(examAttemptsTable).where(eq(examAttemptsTable.candidateId, c.id));
  const exams = await db.select().from(examsTable);
  res.json(atts.map((a) => {
    const e = exams.find((x) => x.id === a.examId);
    return { id: a.id, examId: a.examId, examTitle: e?.title ?? "", examKind: e?.kind ?? "", score: a.score, maxScore: a.maxScore, submittedAt: a.submittedAt?.toISOString() ?? null, startedAt: a.startedAt.toISOString() };
  }));
});

export default router;
