import { Router } from "express";
import { desc, eq, sql, inArray } from "drizzle-orm";
import {
  readDb,
  candidatesTable,
  programsTable,
  specialitiesTable,
  candidatePreferencesTable,
  applicationsTable,
  examAttemptsTable,
  examsTable,
  interviewScoresTable,
  interviewPanelsTable,
  usersTable,
  applicationFormsTable,
  applicationSubmissionsTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middleware/auth";

const router: Router = Router();

router.get("/dashboard/summary", requireAuth, async (req: any, res) => {
  const isMock = req.isMockMode || false;
  const programIdParam = req.query.programId;
  const selectedProgramId = programIdParam && programIdParam !== "all" ? Number(programIdParam) : null;

  try {
    // 1. Fetch all programs
    const allPrograms = await readDb
      .select()
      .from(programsTable)
      .where(eq(programsTable.isMock, isMock));

    // 2. Fetch specialities & forms for active program
    const allSpecsRaw = await readDb.select().from(specialitiesTable);
    const allFormsRaw = await readDb.select().from(applicationFormsTable);
    const allSubsRaw = await readDb.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.isMock, isMock));

    const activeSpecs = selectedProgramId
      ? allSpecsRaw.filter((s) => s.programId === selectedProgramId)
      : allSpecsRaw;

    const activeForms = selectedProgramId
      ? allFormsRaw.filter((f) => f.programId === selectedProgramId)
      : allFormsRaw;

    const activeSpecIds = new Set(activeSpecs.map((s) => s.id));
    const activeFormIds = new Set(activeForms.map((f) => f.id));

    // Submissions belonging to this program's forms
    const programSubmissions = selectedProgramId
      ? allSubsRaw.filter((s) => activeFormIds.has(s.formId))
      : allSubsRaw;

    const programSubCandIds = new Set(programSubmissions.map((s) => s.candidateId).filter((id): id is number => typeof id === "number" && id > 0));
    const programSubEmails = new Set(programSubmissions.map((s) => s.email.toLowerCase().trim()).filter(Boolean));

    // 3. Filter preferences and applications for active specialities
    const allPrefsRaw = await readDb.select().from(candidatePreferencesTable);
    const allAppsRaw = await readDb.select().from(applicationsTable);

    const allPrefs = selectedProgramId
      ? allPrefsRaw.filter((p) => activeSpecIds.has(p.specialityId))
      : allPrefsRaw;

    const allApps = selectedProgramId
      ? allAppsRaw.filter((a) => activeSpecIds.has(a.specialityId))
      : allAppsRaw;

    // Strict Set of Candidate IDs belonging to this program
    const specCandIds = new Set([
      ...allPrefs.map((p) => p.candidateId),
      ...allApps.map((a) => a.candidateId),
    ]);

    const allCandidatesRaw = await readDb
      .select()
      .from(candidatesTable)
      .where(eq(candidatesTable.isMock, isMock));

    // A candidate belongs to this program ONLY IF they have preferences/applications in its specialities OR submissions in its forms
    const allCandidates = selectedProgramId
      ? allCandidatesRaw.filter((c) => specCandIds.has(c.id) || programSubCandIds.has(c.id) || programSubEmails.has(c.email.toLowerCase().trim()))
      : allCandidatesRaw;

    const candidateIdSet = new Set(allCandidates.map((c) => c.id));

    // 4. Panels strictly belonging to this program
    const allPanels = await readDb
      .select()
      .from(interviewPanelsTable)
      .where(eq(interviewPanelsTable.isActive, true));

    const activePanels = selectedProgramId
      ? allPanels.filter((p) => p.programId === selectedProgramId || (p.specialityId && activeSpecIds.has(p.specialityId)))
      : allPanels;

    // 5. Exam Attempts strictly belonging to this program's candidates
    const allAttemptsRaw = await readDb.select().from(examAttemptsTable);
    const attempts = selectedProgramId
      ? allAttemptsRaw.filter((a) => candidateIdSet.has(a.candidateId))
      : allAttemptsRaw;

    const completedAttempts = attempts.filter((a) => a.submittedAt !== null);
    const mcqScores = completedAttempts.map((a) => a.score).filter((s): s is number => typeof s === "number");
    const avgMcqScore = mcqScores.length > 0 ? mcqScores.reduce((acc, v) => acc + v, 0) / mcqScores.length : 0;
    const maxMcqScore = mcqScores.length > 0 ? Math.max(...mcqScores) : 0;

    // 6. Psychometric / Mind Mapping
    const psychoScores = allCandidates
      .map((c) => (c.psychometricScore ? parseFloat(c.psychometricScore) : null))
      .filter((s): s is number => typeof s === "number" && !isNaN(s));
    const avgPsychoScore = psychoScores.length > 0 ? psychoScores.reduce((acc, v) => acc + v, 0) / psychoScores.length : 0;

    // 7. Interview Scores strictly belonging to this program's candidates
    const allInterviewScoresRaw = await readDb.select().from(interviewScoresTable);
    const allInterviewScores = selectedProgramId
      ? allInterviewScoresRaw.filter((i) => candidateIdSet.has(i.candidateId) && (i.specialityId ? activeSpecIds.has(i.specialityId) : true))
      : allInterviewScoresRaw;

    const validInterviewScores = allInterviewScores.map((i) => i.score).filter((s): s is number => typeof s === "number");
    const avgInterviewScore = validInterviewScores.length > 0 ? validInterviewScores.reduce((acc, v) => acc + v, 0) / validInterviewScores.length : 0;

    // 8. Total seats
    const totalSeats = activeSpecs.reduce((acc, s) => acc + (s.seats || 0), 0);
    const allocatedCandidates = allCandidates.filter((c) => c.status === "allocated").length;

    // 9. Specialization Metrics
    const specialityMetrics = activeSpecs.map((s) => {
      const prefCandIds = new Set(allPrefs.filter((p) => p.specialityId === s.id).map((p) => p.candidateId));
      const appCandIds = new Set(allApps.filter((a) => a.specialityId === s.id).map((a) => a.candidateId));
      const unionCandIds = new Set([...prefCandIds, ...appCandIds]);
      const applicantCount = unionCandIds.size;

      const specApps = allApps.filter((a) => a.specialityId === s.id);
      const completedApps = specApps.filter((a) => a.status === "completed").length;

      const specInterviews = allInterviewScores.filter((i) => i.specialityId === s.id);
      const specInterviewAvg = specInterviews.length > 0
        ? specInterviews.reduce((acc: number, v) => acc + (typeof v.score === "number" ? v.score : 0), 0) / specInterviews.length
        : 0;

      const candAttempts = attempts.filter((a) => unionCandIds.has(a.candidateId) && a.submittedAt !== null);
      const candMcqScores = candAttempts.map((a) => a.score).filter((sc): sc is number => typeof sc === "number");
      const specMcqAvg = candMcqScores.length > 0
        ? candMcqScores.reduce((acc, v) => acc + v, 0) / candMcqScores.length
        : 0;

      const specAllocated = allCandidates.filter((c) => c.status === "allocated" && unionCandIds.has(c.id)).length;

      return {
        id: s.id,
        name: s.name,
        code: s.code || "GEN",
        seats: s.seats || 0,
        applicantCount,
        totalApplications: specApps.length || applicantCount,
        interviewCompletedCount: completedApps || allCandidates.filter((c) => (c.status === "interview_completed" || c.status === "allocated") && unionCandIds.has(c.id)).length,
        allocatedCount: specAllocated,
        avgMcqScore: 0,
        avgInterviewScore: 0,
      };
    });

    // 10. Recent Activity Feed strictly for this program's candidates
    const exams = await readDb.select().from(examsTable).where(eq(examsTable.isMock, isMock));
    const users = await readDb.select().from(usersTable);

    type ActivityItem = { id: string; kind: string; title: string; subtitle: string | null; at: string; badgeColor: string };
    const recentActivity: ActivityItem[] = [];

    // Recent registrations
    const recentCandidates = [...allCandidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
    for (const c of recentCandidates) {
      recentActivity.push({
        id: `cand-${c.id}`,
        kind: "registration",
        title: `${c.fullName}`,
        subtitle: `Registered / Approved (${c.candidateCode})`,
        at: c.createdAt.toISOString(),
        badgeColor: "emerald",
      });
    }

    // Recent attempts (only for candidates belonging to this program)
    const recentAttempts = [...attempts].sort((a, b) => (b.submittedAt ?? b.startedAt).getTime() - (a.submittedAt ?? a.startedAt).getTime()).slice(0, 5);
    for (const a of recentAttempts) {
      const cand = allCandidates.find((c) => c.id === a.candidateId);
      if (!cand) continue;
      const e = exams.find((x) => x.id === a.examId);
      recentActivity.push({
        id: `att-${a.id}`,
        kind: a.submittedAt ? "exam_submitted" : "exam_started",
        title: `${cand.fullName} ${a.submittedAt ? "completed" : "started"} exam`,
        subtitle: `${e?.title ?? "MCQ Exam"} • Score: ${a.score !== null ? a.score.toFixed(1) : "In Progress"}`,
        at: (a.submittedAt ?? a.startedAt).toISOString(),
        badgeColor: a.submittedAt ? "amber" : "blue",
      });
    }

    // Recent interviews (only for candidates belonging to this program)
    const recentInterviews = [...allInterviewScores].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime()).slice(0, 5);
    for (const iv of recentInterviews) {
      const cand = allCandidates.find((c) => c.id === iv.candidateId);
      if (!cand) continue;
      const doc = users.find((u) => u.id === iv.doctorId);
      const spec = allSpecsRaw.find((s) => s.id === iv.specialityId);
      recentActivity.push({
        id: `int-${iv.id}`,
        kind: "interview_scored",
        title: `Dr. ${doc?.fullName?.replace(/^Dr\.?\s*/i, "") ?? "Evaluator"} evaluated ${cand.fullName}`,
        subtitle: `${spec?.name ?? "Specialty"} • Score: ${iv.score.toFixed(1)}/50`,
        at: iv.submittedAt.toISOString(),
        badgeColor: "indigo",
      });
    }

    recentActivity.sort((a, b) => (a.at < b.at ? 1 : -1));

    const currentDate = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const activeProgram = allPrograms.find((p) => p.id === selectedProgramId);

    const approvedCandidatesCount = allCandidates.filter(
      (c) => c.status === "approved" || c.status === "interview_completed" || c.status === "allocated"
    ).length;
    const pendingCandidatesCount = allCandidates.filter((c) => c.status === "pending").length;
    const interviewCompletedCandidatesCount = allCandidates.filter(
      (c) => c.status === "interview_completed" || c.status === "allocated"
    ).length;
    const paidSubmissionsCount = programSubmissions.filter((s) => s.paidAmount && s.paidAmount > 0).length || allCandidates.length;

    res.json({
      programs: allPrograms.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        category: p.category,
        academicYear: p.academicYear,
      })),
      selectedProgramId,
      selectedProgramName: activeProgram?.name || (selectedProgramId ? "Selected Program" : "All Programs"),
      overall: {
        totalApplicants: allCandidates.length,
        totalApplications: allApps.length > 0 ? allApps.length : allPrefs.length,
        currentDate,
      },
      stages: {
        candidates: {
          total: allCandidates.length,
          paidCount: paidSubmissionsCount,
          pendingReview: pendingCandidatesCount,
          approved: approvedCandidatesCount,
          interviewCompleted: interviewCompletedCandidatesCount,
          allocated: allocatedCandidates,
          callLettersIssued: approvedCandidatesCount,
        },
        applications: {
          total: allCandidates.length,
          paidCount: paidSubmissionsCount,
          pendingCount: Math.max(0, allCandidates.length - paidSubmissionsCount),
        },
        approvals: {
          approvedCount: approvedCandidatesCount,
          pendingCount: pendingCandidatesCount,
        },
        callLetters: {
          issuedCount: approvedCandidatesCount,
          scheduledCount: allApps.filter((a) => a.batchId !== null || a.interviewSlot !== null).length || approvedCandidatesCount,
        },
        interviews: {
          completedCount: interviewCompletedCandidatesCount,
          inProgressCount: allCandidates.filter((c) => c.status === "approved").length,
          activePanelsCount: activePanels.length,
        },
        selections: {
          totalSeats,
          allocatedSeats: allocatedCandidates,
          vacantSeats: Math.max(0, totalSeats - allocatedCandidates),
          offerLettersIssued: allocatedCandidates,
        },
        mcq: {
          totalAssigned: allCandidates.length,
          attemptsCount: 0,
          completedCount: 0,
          avgScore: 0,
          maxScore: 0,
        },
        psychometric: {
          totalAssigned: allCandidates.length,
          completedCount: 0,
          avgScore: 0,
        },
        interview: {
          totalApplications: allApps.length > 0 ? allApps.length : allPrefs.length,
          completedCount: interviewCompletedCandidatesCount,
          inProgressCount: allCandidates.filter((c) => c.status === "approved").length,
          avgScore: 0,
          activePanelsCount: activePanels.length,
        },
        merit: {
          totalSeats,
          allocatedSeats: allocatedCandidates,
          vacantSeats: Math.max(0, totalSeats - allocatedCandidates),
        },
      },
      specialities: specialityMetrics,
      recentActivity: recentActivity.slice(0, 10),
    });
  } catch (error: any) {
    req.log?.error?.({ err: error }, "Failed to fetch dashboard summary");
    res.status(500).json({ error: error.message || "Failed to load dashboard metrics" });
  }
});

// Doctor: Get personal session statistics (read-only dashboard)
router.get("/dashboard/doctor-stats", requireAuth, requireRole("doctor"), async (req: any, res) => {
  const doctorId = req.user!.userId;

  const panelQuery = await readDb.execute(sql`
    SELECT ip.id as panel_id, ip.name as panel_name, ip.speciality_id,
           s.name as speciality_name
    FROM interview_panel_members ipm
    JOIN interview_panels ip ON ip.id = ipm.panel_id
    LEFT JOIN specialities s ON s.id = ip.speciality_id
    WHERE ipm.doctor_id = ${doctorId} AND ip.is_active = TRUE
    LIMIT 1
  `);
  const activePanel = panelQuery.rows[0] as {
    panel_id: number;
    panel_name: string;
    speciality_id: number | null;
    speciality_name: string | null;
  } | undefined;

  let totalAssigned = 0;
  let totalCompleted = 0;
  let remaining = 0;
  let avgInterviewMinutes: number | null = null;
  let panelName: string | null = null;
  let specialityName: string | null = null;

  if (activePanel) {
    panelName = activePanel.panel_name;
    specialityName = activePanel.speciality_name;

    const queueCountQuery = await readDb.execute(sql`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM panel_queue
      WHERE panel_id = ${activePanel.panel_id}
    `);
    const row = queueCountQuery.rows[0] as { total: string; completed_count: string } | undefined;
    totalAssigned = Number(row?.total ?? 0);
    totalCompleted = Number(row?.completed_count ?? 0);
    remaining = Math.max(0, totalAssigned - totalCompleted);
  } else {
    const assignRows = await readDb.execute(sql`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN da.status = 'completed' THEN 1 ELSE 0 END) as done
      FROM doctor_assignments da
      WHERE da.doctor_id = ${doctorId}
    `);
    const row = assignRows.rows[0] as { total: string; done: string } | undefined;
    totalAssigned = Number(row?.total ?? 0);
    totalCompleted = Number(row?.done ?? 0);
    remaining = Math.max(0, totalAssigned - totalCompleted);
  }

  const avgQuery = await readDb.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (submitted_at - created_at)) / 60) as avg_minutes
    FROM interview_scores
    WHERE doctor_id = ${doctorId}
  `);
  const avgRow = avgQuery.rows[0] as { avg_minutes: string | null } | undefined;
  if (avgRow?.avg_minutes) {
    avgInterviewMinutes = Math.round(Number(avgRow.avg_minutes) * 10) / 10;
  }

  const recentScores = await readDb.execute(sql`
    SELECT ist.id, ist.candidate_id, ist.score, ist.submitted_at,
           c.full_name as candidate_name, c.candidate_code
    FROM interview_scores ist
    JOIN candidates c ON c.id = ist.candidate_id
    WHERE ist.doctor_id = ${doctorId}
    ORDER BY ist.submitted_at DESC
    LIMIT 5
  `);

  res.json({
    panelName,
    specialityName,
    totalAssigned,
    totalCompleted,
    remaining,
    avgInterviewMinutes,
    recentlyScoredCandidates: recentScores.rows.map((r: any) => ({
      id: Number(r.id),
      candidateId: Number(r.candidate_id),
      candidateName: String(r.candidate_name ?? ""),
      candidateCode: String(r.candidate_code ?? ""),
      score: Number(r.score),
      scoredAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
    })),
  });
});

export default router;
